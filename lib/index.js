/**
 * Client-side token-bucket rate limiter for LLM requests in the DeepSeek Harness.
 *
 * Hooks the `llm/stream` waterfall — the single choke point every model call
 * funnels through (agent loop, session titles, compaction) — and throttles per
 * provider+model route before the request reaches the adapter. Mode "reject"
 * (default) short-circuits with a terminal RATE_LIMIT finish so
 * @deepseek-ai/dsh-llm-retry retries after `providerRetryAfterMs` (set to the
 * time until the next token refills, so retries self-space); mode "wait"
 * queues instead — FIFO per route, capped by `maxWaitMs` and the request's
 * AbortSignal.
 *
 * Hardening: the config route only trusts same-origin requests to a loopback
 * Host (blocks cross-site POSTs and DNS rebinding), settings changes retune
 * buckets in place instead of resetting them (no free burst, no stranded
 * waiters), buckets tick on a monotonic clock, and the fetch identity patch
 * unwinds on dispose.
 *
 * The configurable surface doubles as a settings namespace: `installSettingsSection`
 * registers `provider-rate-limit` so the web UI can edit it. The composition entry
 * (this plugin's row config) is the namespace `base`; UI edits land in the user
 * layer on top; `source()` always resolves the effective merge.
 *
 * @module dsh-provider-rate-limit
 */
import { randomBytes } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection } from "@deepseek-ai/dsh-settings";

const name = "provider-rate-limit";
const inject = ["llm"];
const SETTINGS_NAMESPACE = "provider-rate-limit";
const STATS_SERVICE_NAME = "provider-rate-limit/stats";

const ModelLimitConfig = z.object({
  /** Provider route key this limit applies to; "" means every provider. */
  provider: z.string().default(""),
  /** Model id this limit applies to; "" means every model of the provider. */
  model: z.string().default(""),
  /** Requests per minute for this route. 0 = unlimited (pass-through). */
  requestsPerMinute: z.number().min(0),
  /** Burst capacity: max requests allowed back-to-back after a quiet period. */
  burst: z.natural().min(1),
});

const IdentityRuleConfig = z.object({
  /**
   * Substring matched against the full outbound URL; the first enabled rule
   * whose pattern matches claims the request.
   */
  urlPattern: z.string().min(1),
  /**
   * Replaces the user-agent sent upstream (e.g. "opencode/1.18.25 ...").
   * Empty string leaves the original value untouched.
   */
  userAgent: z.string().default(""),
  /**
   * Injects x-opencode-client/project/session/request headers, generating a
   * fresh ULID pair per request — mirrors the official CLI's identity set,
   * which the zen gateway reads for metrics/sticky routing before stripping
   * them upstream. Static values would look like replay abuse; never reuse.
   * The header names are part of THAT gateway's contract, so this switch is
   * OpenCode-specific; other gateways should declare theirs via `headers`.
   */
  dynamicIds: z.boolean().default(false),
  /**
   * Extra static headers for gateways with their own client checks — any
   * name/value pair, applied after the UA rewrite so an entry can override it.
   */
  headers: z
    .array(z.object({ name: z.string().min(1), value: z.string().default("") }))
    .default([]),
  enabled: z.boolean().default(true),
});

const Config = z.object({
  /**
   * Master switch. Checked per call (not by unregistering the listener), so
   * toggling it takes effect immediately without touching the waterfall.
   */
  enabled: z.boolean().default(true),
  /** Default requests per minute for any route without an explicit entry. 0 = unlimited. */
  requestsPerMinute: z.number().min(0).default(10),
  /** Default burst capacity for any route without an explicit entry. */
  burst: z.natural().min(1).default(2),
  /**
   * "reject": fail fast with a RATE_LIMIT finish (composes with dsh-llm-retry).
   * "wait": queue until a token frees up, capped by `maxWaitMs`.
   */
  mode: z.union(["reject", "wait"]).default("reject"),
  /** Cap on how long "wait" mode blocks a request before falling back to reject. */
  maxWaitMs: z.number().min(0).default(30000),
  /**
   * When true, an upstream HTTP 429 (e.g. workspace quota exhausted) puts the
   * affected route into a cooldown window. New requests queue (wait mode) or
   * reject (reject mode) until the window passes, instead of hammering the
   * provider. The window is `failure.providerRetryAfterMs` (from the Retry-After
   * header) when present, else `backoffMs`.
   */
  upstream429Backoff: z.boolean().default(true),
  /** Initial cooldown window (ms) when the upstream 429 carries no Retry-After. */
  backoffMs: z.number().min(0).default(30000),
  /**
   * Maximum cooldown window for exponential backoff. When > backoffMs, each
   * consecutive 429 doubles the delay (capped here). 0 = fixed cooldown
   * (backward-compatible, same as backoffMs).
   */
  maxBackoffMs: z.number().min(0).default(0),
  /**
   * Symmetric jitter ratio (0–1) applied to the cooldown delay after the
   * exponential scaling. 0 = no jitter (deterministic); 0.1 = ±10 %.
   */
  backoffJitter: z.number().min(0).max(1).default(0),
  /**
   * Maximum concurrent in-flight requests per route. When > 0, new requests
   * wait for a free slot even if RPM capacity is available. 0 = unlimited.
   */
  maxConcurrentRequests: z.number().min(0).default(0),
  /**
   * Per-route rate-limit entries. Match order: exact provider+model, then
   * provider-wide (model ""), then global (provider ""), then the defaults.
   */
  models: z.array(ModelLimitConfig).default([]),
  /** Per-URL client-identity rules applied at the fetch boundary before requests leave the process. */
  identityRules: z.array(IdentityRuleConfig).default([]),
});

/**
 * Reservation-based token bucket (pattern popularized by dsh-rate-limiter):
 * each caller synchronously claims a slot and learns its exact wait, so
 * concurrent requests queue in strict arrival order with no polling and no
 * over-issue — no fairness chain needed. Idle time recovers up to `capacity`
 * slots through the moving floor computed inside reserve(). Monotonic clock
 * throughout: Date.now() jumps with NTP resyncs.
 *
 * Stats tracking: reserved (total claims), waited (claims requiring delay),
 * totalWaitMs (cumulative ms spent waiting), rejected (times fell through to
 * RATE_LIMIT finish). Resettable via the service API for per-window accounting.
 */
class TokenBucket {
  constructor(capacity, perSecond) {
    this.capacity = capacity;
    this.unlimited = perSecond <= 0;
    this.intervalMs = this.unlimited ? 1 : 1000 / perSecond;
    // Start fully charged: capacity-1 slots are immediately available.
    this.next = performance.now() - (capacity - 1) * this.intervalMs;
    // Cooldown window (ms timestamp, 0 = none): set after an upstream 429 so
    // new requests queue until the provider's quota window passes. The token
    // clock is not advanced during cooldown, so the bucket stays full and
    // resumes at the configured steady-state rate once the window ends.
    this.coolUntil = 0;
    // Consecutive upstream 429 failures for exponential backoff.
    this.consecutiveFails = 0;
    // Active in-flight requests for concurrency limiting.
    this.activeCount = 0;
    // Stats counters.
    this.reserved = 0;
    this.waited = 0;
    this.totalWaitMs = 0;
    this.rejected = 0;
  }

  /**
   * Enter a cooldown window of `ms` (extends any active window). Requests
   * reserving before the window ends wait the remaining time.
   */
  cool(ms) {
    const until = performance.now() + ms;
    this.coolUntil = Math.max(this.coolUntil, until);
  }

  /**
   * Retune limits in place; takes effect on the next reserve() because the
   * idle-recovery floor is derived from the live fields there. Growing
   * capacity lowers the floor (legitimately more immediate slots); shrinking
   * it raises the floor while an already-scheduled `next` stays put —
   * conservative, never mints extra throughput.
   */
  retune(capacity, perSecond) {
    this.capacity = capacity;
    this.unlimited = perSecond <= 0;
    this.intervalMs = this.unlimited ? 1 : 1000 / perSecond;
  }

  /** Milliseconds until a slot would be available if claimed right now. */
  peekWait() {
    const now = performance.now();
    if (this.coolUntil > now) return this.coolUntil - now;
    if (this.unlimited) return 0;
    const floor = now - (this.capacity - 1) * this.intervalMs;
    return Math.max(0, Math.max(this.next, floor) - now);
  }

  /**
   * Claim one slot; returns the milliseconds to wait (0 = pass now). A
   * claimed slot is NOT refunded when the caller gives up — later requests may
   * wait slightly longer, which is conservative and safe: automatic refunds
   * would invite abandon-and-retry storms to mint throughput.
   */
  reserve() {
    const now = performance.now();
    this.reserved++;
    // Cooldown gates even unlimited buckets: an upstream 429 means "wait a
    // while", independent of the configured steady-state rate.
    if (this.coolUntil > now) {
      const coolWait = this.coolUntil - now;
      this.waited++;
      this.totalWaitMs += coolWait;
      return coolWait;
    }
    if (this.unlimited) return 0;
    const floor = now - (this.capacity - 1) * this.intervalMs;
    const base = Math.max(this.next, floor);
    const waitMs = Math.max(0, base - now);
    this.next = base + this.intervalMs;
    if (waitMs > 0) {
      this.waited++;
      this.totalWaitMs += waitMs;
    }
    return waitMs;
  }

  /** Mark a rejection (caller fell through to RATE_LIMIT finish). */
  markRejected() {
    this.rejected++;
  }

  /** Reset stats counters (for per-window accounting). */
  resetStats() {
    this.reserved = 0;
    this.waited = 0;
    this.totalWaitMs = 0;
    this.rejected = 0;
  }

  /** Snapshot of current stats for serialization. */
  getStats() {
    return {
      reserved: this.reserved,
      waited: this.waited,
      totalWaitMs: this.totalWaitMs,
      rejected: this.rejected,
      avgWaitMs: this.waited > 0 ? Math.round(this.totalWaitMs / this.waited) : 0,
      peekWaitMs: this.peekWait(),
    };
  }
}

/**
 * Cancellable sleep. Resolves true when the full delay elapses and false when
 * the signal aborted first — the caller must not proceed on false. With the
 * reservation bucket above, this is the whole waiting story: the queue is the
 * slot schedule itself, so there is nothing to poll and nobody to starve.
 */
function delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    let timer;
    const finish = (completed) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    timer = setTimeout(() => finish(true), Math.max(0, ms));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Forward the downstream LLM stream while watching for an upstream HTTP 429.
 * When one arrives and `upstream429Backoff` is enabled, put the route's bucket
 * into a cooldown window so subsequent requests queue/reject until the
 * provider's quota window passes. The 429 finish itself is still forwarded
 * (so dsh-llm-retry can act on it); the plugin only shapes what happens next.
 */
async function* runNext(next, bucket, cfg) {
  for await (const ev of next()) {
    if (
      cfg?.upstream429Backoff !== false &&
      ev?.type === "finish" &&
      ev.reason?.failure &&
      ev.reason.failure.status === 429
    ) {
      const retryMs = ev.reason.failure.providerRetryAfterMs;
      const hasProviderRetry = Number.isFinite(retryMs) && retryMs > 0;
      let ms = hasProviderRetry ? retryMs : (cfg.backoffMs ?? 30000);
      // Exponential backoff: double for each consecutive 429, capped by maxBackoffMs.
      if (!hasProviderRetry) {
        const maxMs = cfg.maxBackoffMs > 0 ? cfg.maxBackoffMs : ms;
        ms = Math.min(ms * Math.pow(2, bucket.consecutiveFails), maxMs);
      }
      // Jitter: symmetric ±ratio around the computed delay.
      const jitter = cfg.backoffJitter ?? 0;
      if (jitter > 0) {
        ms = Math.round(ms * (1 + jitter * (Math.random() * 2 - 1)));
      }
      bucket.cool(Math.max(1, ms));
      bucket.consecutiveFails++;
    } else if (ev?.type === "finish") {
      // Non-429 finish resets the backoff counter.
      bucket.consecutiveFails = 0;
    }
    yield ev;
  }
}

const CONFIG_ROUTE = "/api/provider-rate-limit.config";

// Standard ULID: 26 chars = 10 time chars (48-bit big-endian) + 16 random chars (80-bit).
// Crockford base-32 alphabet (I/L/O/U omitted to avoid visual confusion).
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_TIME_LEN = 10;
const ULID_RANDOM_LEN = 16;
const ULID_TOTAL_LEN = ULID_TIME_LEN + ULID_RANDOM_LEN; // 26

function ulid() {
  let out = "";
  let time = BigInt(Date.now());
  // Encode 48-bit timestamp as big-endian Crockford base-32 (10 chars).
  for (let i = 0; i < ULID_TIME_LEN; i++) {
    out = ULID_ALPHABET[Number(time & 31n)] + out;
    time >>= 5n;
  }
  // 80 bits of randomness = 10 bytes, encoded as 16 Crockford chars.
  const randBytes = randomBytes(10);
  for (const byte of randBytes) out += ULID_ALPHABET[byte & 31];
  return out;
}

// Cached regex for validating a standard ULID format (26 Crockford chars).
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function writeJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const MAX_BODY_BYTES = 65536;

/**
 * The config route mutates limiter settings, so it must refuse requests no
 * local page could have sent honestly:
 * - Host must be loopback. This blocks DNS rebinding, where a remote page's
 *   origin hostname resolves to 127.0.0.1 and would otherwise echo-match its
 *   own Host header.
 * - If an Origin is present it must equal the Host header. Browsers attach
 *   Origin to every cross-site POST (forms and no-cors fetches included) and
 *   it cannot be forged from those paths; a mismatched one is an attack.
 * - Absent Origin means a non-browser client (curl, the host itself).
 */
function untrustedRequest(req) {
  const hostHeader = String(req.headers.host ?? "");
  const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
  if (!LOOPBACK_HOSTNAMES.has(hostname)) return "non-loopback-host";
  const origin = req.headers.origin;
  if (origin === undefined || origin === "") return null;
  if (origin === "null") return "null-origin";
  try {
    return new URL(origin).host === hostHeader ? null : "origin-mismatch";
  } catch {
    return "origin-unparseable";
  }
}

/**
 * The host refuses settings namespaces outside its allowlist, so the client
 * card reads and writes through this route instead of the host settings seam.
 */
function registerConfigRoute(ctx) {
  ctx.inject(["webServer"], (wctx) => {
    const dispose = wctx.webServer.register({
      kind: "exact",
      path: CONFIG_ROUTE,
      handler: async (req, res) => {
        try {
          const distrust = untrustedRequest(req);
          if (distrust !== null) {
            writeJson(res, 403, { ok: false, code: "untrusted-request", reason: distrust });
            return;
          }
          const settings = ctx.get("settings");
          if (settings === void 0) {
            writeJson(res, 503, { ok: false, code: "settings-absent" });
            return;
          }
          const view = () =>
            settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === SETTINGS_NAMESPACE);
          if (req.method === "GET" || req.method === "HEAD") {
            const descriptor = view();
            if (descriptor === void 0) {
              writeJson(res, 404, { ok: false, code: "namespace-missing" });
              return;
            }
            writeJson(res, 200, {
              ok: true,
              value: { writable: settings.writable, revision: descriptor.revision, value: descriptor.value },
            });
            return;
          }
          if (req.method === "POST") {
            let raw = "";
            for await (const chunk of req) {
              raw += chunk;
              if (raw.length > MAX_BODY_BYTES) throw new Error("request body too large");
            }
            const body = JSON.parse(raw || "{}");
            await settings.replace(SETTINGS_NAMESPACE, body.patch ?? body, body.expectedRevision);
            const descriptor = view();
            writeJson(res, 200, {
              ok: true,
              value: { writable: settings.writable, revision: descriptor?.revision },
            });
            return;
          }
          writeJson(res, 405, { ok: false, code: "method-not-allowed" });
        } catch (error) {
          writeJson(res, 400, {
            ok: false,
            code: "settings-rejected",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
    wctx.effect(() => dispose, "provider-rate-limit: config route");
  });
}

const IDENTITY_PATCH_KEY = Symbol.for("dsh-plugin.provider-rate-limit.identityFetch");

function installIdentityPatch(effective) {
  let state = globalThis[IDENTITY_PATCH_KEY];
  if (!state || typeof state.wrap !== "function") {
    const native = globalThis.fetch;
    const wrap = function (input, init) {
      let url = "";
      try {
        url =
          typeof input === "string" ? input :
          input instanceof URL ? input.href :
          input instanceof Request ? input.url :
          String(input);
      } catch (err) {
        // Guard against exotic input types that throw during String() coercion.
        // Log a warning so devs notice misconfigured callers; the request still
        // passes through unmodified rather than crashing the fetch chain.
        console.warn("[provider-rate-limit] failed to extract URL from request:", err?.message ?? err);
      }
      // NOTE on hot-reload: `state.rules` is read fresh on every call (line 331),
      // NOT captured at wrap-creation time. So when settings change and
      // `effective()` returns a new config, the next fetch invocation sees the
      // updated rules automatically — no re-patching needed. The wrapper closure
      // only captures `state` (the object), and we mutate `state.rules` in-place.
      const rule =
        url === "" ? null :
        (state.rules().identityRules ?? []).find((entry) =>
          entry?.enabled !== false &&
          typeof entry.urlPattern === "string" &&
          entry.urlPattern.length > 0 &&
          url.includes(entry.urlPattern),
        ) ?? null;
      if (!rule) return state.native.call(this, input, init);
      // init.headers replaces a Request's headers wholesale per spec, so seed
      // from whichever source actually carries the caller's header set.
      const seeded =
        init?.headers !== undefined ? init.headers :
        input instanceof Request ? input.headers : undefined;
      const headers = new Headers(seeded);
      if (rule.userAgent) headers.set("user-agent", rule.userAgent);
      if (rule.dynamicIds) {
        headers.set("x-opencode-client", "cli");
        headers.set("x-opencode-project", "global");
        headers.set("x-opencode-session", `ses_${ulid()}`);
        headers.set("x-opencode-request", `msg_${ulid()}`);
      }
      // Static extras last, so an explicit entry can override even the UA
      // rewrite above.
      for (const extra of rule.headers ?? []) {
        const headerName = typeof extra?.name === "string" ? extra.name.trim() : "";
        if (headerName !== "") headers.set(headerName, String(extra?.value ?? ""));
      }
      return state.native.call(this, input, { ...init, headers });
    };
    state = { native, wrap, refs: 0 };
    globalThis.fetch = wrap;
    globalThis[IDENTITY_PATCH_KEY] = state;
  }
  state.rules = effective;
  state.refs += 1;
  // The returned dispose restores native fetch only when the last consumer of
  // this wrapper goes away, and only while our wrap is still the installed
  // one — a patcher layered above us in the meantime must not be clobbered.
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    state.refs -= 1;
    if (state.refs <= 0 && globalThis.fetch === state.wrap) {
      delete globalThis[IDENTITY_PATCH_KEY];
      globalThis.fetch = state.native;
    }
  };
}

async function apply(ctx, config) {
  /** route key → { provider, model, bucket } */
  const buckets = new Map();
  let source = () => config;

  const effective = () => source();

  registerConfigRoute(ctx);

  const disposeIdentity =
    typeof globalThis.fetch === "function" ? installIdentityPatch(effective) : void 0;
  if (disposeIdentity) ctx.effect(() => disposeIdentity, "provider-rate-limit: identity fetch patch");

  // Pre-built lookup maps for O(1) route matching. Rebuilt whenever effective()
  // changes (i.e. on settings updates) so the hot path stays fast.
  let rulesMap = null; // Map<key, entry> for exact/provider-wide/global lookups

  const rebuildRulesMap = () => {
    const rows = effective().models;
    const map = new Map();
    for (const entry of rows) {
      const k = `${entry.provider}\u0000${entry.model}`;
      map.set(k, entry);
    }
    rulesMap = map;
  };

  /**
   * O(1) route lookup using pre-built map. Match order preserved: exact
   * provider+model, then provider-wide (model ""), then global (provider "").
   * Falls back to null (use defaults) when nothing matches.
   */
  const limitFor = (provider, model) => {
    const map = rulesMap;
    const exactKey = `${provider}\u0000${model}`;
    const providerKey = `${provider}\u0000`;
    const globalKey = `\u0000`; // provider="" and model=""
    return map?.get(exactKey) ?? map?.get(providerKey) ?? map?.get(globalKey) ?? null;
  };

  const resolveBucket = (provider, model) => {
    const key = `${provider}\u0000${model}`;
    let entry = buckets.get(key);
    if (!entry) {
      const limit = limitFor(provider, model);
      const rpm = limit?.requestsPerMinute ?? effective().requestsPerMinute;
      const burst = limit?.burst ?? effective().burst;
      entry = { provider, model, bucket: new TokenBucket(burst, rpm / 60) };
      buckets.set(key, entry);
    }
    return entry.bucket;
  };

  /**
   * Settings changes retune existing buckets instead of dropping them. A
   * clear() would hand every route an instant full burst — freeing exactly
   * the traffic this limiter exists to shape — and strand queued waiters on
   * detached objects until their maxWaitMs expires.
   */
  const syncBuckets = () => {
    rebuildRulesMap();
    for (const entry of buckets.values()) {
      const limit = limitFor(entry.provider, entry.model);
      const rpm = limit?.requestsPerMinute ?? effective().requestsPerMinute;
      const burst = limit?.burst ?? effective().burst;
      entry.bucket.retune(burst, rpm / 60);
    }
  };

  // Stats service: exposes per-route and aggregate rate-limit statistics so
  // other plugins (e.g. dashboards, analytics) can query current state.
  const statsService = {
    /** Get stats for a specific provider/model route. */
    getStats(provider, model) {
      const key = `${provider}\u0000${model}`;
      const entry = buckets.get(key);
      return entry ? entry.bucket.getStats() : null;
    },
    /** Get stats for all active routes. */
    getAllStats() {
      const result = {};
      for (const [key, entry] of buckets) {
        result[key] = entry.bucket.getStats();
      }
      return result;
    },
    /** Get aggregate stats across all routes. */
    getAggregateStats() {
      let total = { reserved: 0, waited: 0, totalWaitMs: 0, rejected: 0 };
      for (const entry of buckets.values()) {
        total.reserved += entry.bucket.reserved;
        total.waited += entry.bucket.waited;
        total.totalWaitMs += entry.bucket.totalWaitMs;
        total.rejected += entry.bucket.rejected;
      }
      return {
        ...total,
        avgWaitMs: total.waited > 0 ? Math.round(total.totalWaitMs / total.waited) : 0,
        routes: buckets.size,
      };
    },
    /** Reset stats counters (for per-window accounting). */
    resetStats(provider, model) {
      if (provider && model) {
        const key = `${provider}\u0000${model}`;
        const entry = buckets.get(key);
        if (entry) entry.bucket.resetStats();
      } else {
        for (const entry of buckets.values()) entry.bucket.resetStats();
      }
    },
  };

  // Register the stats service so other plugins can access it via ctx.get().
  // Guarded: ctx.reflect may be absent in test stubs or non-Cordis contexts.
  if (typeof ctx.reflect?.provide === "function") {
    ctx.reflect.provide(STATS_SERVICE_NAME, statsService);
  }

  // Package-private RPC: lets the client-side stats card pull live numbers.
  // Registered inside the current fiber so it unwinds automatically on stop.
  // Guarded: harness is a sandbox global; skip when running outside Cordis (tests).
  if (typeof harness !== "undefined" && typeof harness.handle === "function") {
    const dispose = harness.handle("provider-rate-limit.stats", async () => {
      return {
        aggregate: statsService.getAggregateStats(),
        routes: statsService.getAllStats(),
      };
    });
    ctx.effect(() => dispose, "provider-rate-limit: stats RPC");
  }

  // Read-only live counters for the client stats card. Plain HTTP like the
  // config route: static plugin clients have no host.call channel (that is a
  // dynamic runner facility), so the browser fetches this URL directly. This
  // registration lives in THIS scope because the handler closes over
  // statsService — a module-level definition cannot see it.
  ctx.inject(["webServer"], (wctx) => {
    const dispose = wctx.webServer.register({
      kind: "exact",
      path: "/api/provider-rate-limit.stats",
      handler: async (req, res) => {
        try {
          if (req.method !== "GET" && req.method !== "HEAD") {
            writeJson(res, 405, { ok: false, code: "method-not-allowed" });
            return;
          }
          writeJson(res, 200, {
            ok: true,
            value: {
              aggregate: statsService.getAggregateStats(),
              routes: statsService.getAllStats(),
            },
          });
        } catch (error) {
          writeJson(res, 500, {
            ok: false,
            code: "stats-unavailable",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
    wctx.effect(() => dispose, "provider-rate-limit: stats route");
  });

  ctx.on(
    "llm/stream",
    async function* (options, next) {
      // Master switch: checked per call so toggling needs no re-registration.
      if (effective().enabled === false) {
        yield* next();
        return;
      }

      const provider = options.provider;
      const model = options.model;
      const limit = limitFor(provider, model);
      const rpm = limit?.requestsPerMinute ?? effective().requestsPerMinute;

      // Synchronous reservation: this IS the queue. Arrival order on a single
      // thread is FIFO by construction, and the returned waitMs is exact —
      // no polling, no wake-order races. When rpm is 0 (unlimited) the bucket
      // still counts the request but always returns 0 wait, so stats keep
      // tracking total traffic without throttling it.
      const bucket = resolveBucket(provider, model);
      const waitMs = bucket.reserve();
      const cfg = effective();

      // RPM gating: wait or reject when the reservation shows a shortfall.
      if (waitMs > 0) {
        if (
          cfg.mode === "wait" &&
          waitMs <= Math.max(0, cfg.maxWaitMs) &&
          (await delay(waitMs, options.signal))
        ) {
          // Waited successfully — proceed to concurrency gate below.
        } else {
          // Reject path: short-circuit with a terminal RATE_LIMIT finish whose
          // providerRetryAfterMs equals the reservation shortfall, so
          // dsh-llm-retry wakes roughly when the slot would have opened anyway.
          bucket.markRejected();
          const retryAfterMs = Math.max(waitMs, 1000);
          yield {
            type: "finish",
            reason: {
              kind: "error",
              failure: {
                message: `Rate limit: ${provider}/${model} exceeded ${rpm} req/min; retry in ${Math.ceil(retryAfterMs / 1000)}s`,
                code: "RATE_LIMIT",
                status: 429,
                providerRetryAfterMs: retryAfterMs,
              },
            },
          };
          return;
        }
      }

      // Concurrency gate: when maxConcurrentRequests > 0, wait for a free
      // in-flight slot even if RPM capacity is available. Polls every 100ms;
      // the abort signal breaks the loop if the caller gives up.
      const maxConcurrent = cfg.maxConcurrentRequests ?? 0;
      if (maxConcurrent > 0) {
        while (bucket.activeCount >= maxConcurrent) {
          if (options.signal?.aborted) return;
          if (!(await delay(100, options.signal))) return;
        }
        bucket.activeCount++;
      }

      try {
        yield* runNext(next, bucket, cfg);
      } finally {
        if (maxConcurrent > 0) bucket.activeCount--;
      }
    },
    { global: true, prepend: true },
  );

  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (next) => {
      source = next;
      syncBuckets();
    },
    onChange: () => {
      syncBuckets();
    },
  });
}

export default { name, inject, apply, Config };
/**
 * Exposed service: `provider-rate-limit/stats`
 *
 * Other plugins can read rate-limit statistics via:
 *   const stats = ctx.get("provider-rate-limit/stats");
 *   stats.getStats("opencode", "deepseek-v4-flash-free");
 *   stats.getAllStats();
 *   stats.getAggregateStats();
 *   stats.resetStats();
 */
