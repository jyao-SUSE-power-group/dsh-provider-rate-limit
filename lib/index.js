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

const ModelLimitConfig = z.object({
  /** Provider route key this limit applies to; "" means every provider. */
  provider: z.string().default(""),
  /** Model id this limit applies to; "" means every model of the provider. */
  model: z.string().default(""),
  /** Requests per minute for this route. */
  requestsPerMinute: z.number().min(0.1),
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
   * Replaces the user-agent sent upstream (e.g. "opencode/1.18.18 ...").
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
  /** Default requests per minute for any route without an explicit entry. */
  requestsPerMinute: z.number().min(0.1).default(10),
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
 */
class TokenBucket {
  constructor(capacity, perSecond) {
    this.capacity = capacity;
    this.intervalMs = 1000 / perSecond;
    // Start fully charged: capacity-1 slots are immediately available.
    this.next = performance.now() - (capacity - 1) * this.intervalMs;
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
    this.intervalMs = 1000 / perSecond;
  }

  /** Milliseconds until a slot would be available if claimed right now. */
  peekWait() {
    const now = performance.now();
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
    const floor = now - (this.capacity - 1) * this.intervalMs;
    const base = Math.max(this.next, floor);
    const waitMs = Math.max(0, base - now);
    this.next = base + this.intervalMs;
    return waitMs;
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

const CONFIG_ROUTE = "/api/provider-rate-limit.config";

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid() {
  let out = "";
  let time = Date.now();
  for (let i = 0; i < 10; i += 1) {
    out = ULID_ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  for (const byte of randomBytes(16)) out += ULID_ALPHABET[byte & 31];
  return out;
}

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
      } catch {}
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

  const limitFor = (provider, model) => {
    const rows = effective().models;
    const exact = rows.find((entry) => entry.provider === provider && entry.model === model);
    if (exact) return exact;
    const providerWide = rows.find((entry) => entry.provider === provider && entry.model === "");
    if (providerWide) return providerWide;
    const global = rows.find((entry) => entry.provider === "" && entry.model === "");
    if (global) return global;
    return null;
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
    for (const entry of buckets.values()) {
      const limit = limitFor(entry.provider, entry.model);
      const rpm = limit?.requestsPerMinute ?? effective().requestsPerMinute;
      const burst = limit?.burst ?? effective().burst;
      entry.bucket.retune(burst, rpm / 60);
    }
  };

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
      // no polling, no wake-order races.
      const waitMs = resolveBucket(provider, model).reserve();
      if (waitMs === 0) {
        yield* next();
        return;
      }

      // Wait-mode queues up to maxWaitMs; anything longer — and everything in
      // reject mode — short-circuits into a terminal RATE_LIMIT finish whose
      // providerRetryAfterMs equals the reservation shortfall, so
      // dsh-llm-retry wakes roughly when the slot would have opened anyway.
      if (
        effective().mode === "wait" &&
        waitMs <= Math.max(0, effective().maxWaitMs) &&
        (await delay(waitMs, options.signal))
      ) {
        yield* next();
        return;
      }

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
