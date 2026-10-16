/**
 * Identity patch suite: header injection on matching URLs, passthrough
 * elsewhere, refcounted wrapper reuse, dispose lifecycle, master switch.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { drain, loadPlugin, makeDisposerCtx } from "./helpers.js";

const mod = await loadPlugin();

// Stub native fetch BEFORE apply() so the plugin's patch wraps the spy.
// The plugin restores THIS spy on dispose (it captures whatever was
// installed at patch time), so assertions compare against spyFetch.
let lastInit = null;
async function spyFetch(input, init) {
  lastInit = { url: String(input), headers: init?.headers };
  return new Response("{}", { headers: { "content-type": "application/json" } });
}

function identityConfig(overrides = {}) {
  return {
    enabled: true,
    requestsPerMinute: 600,
    burst: 100,
    mode: "reject",
    maxWaitMs: 1000,
    models: [],
    identityRules: [
      {
        urlPattern: "gateway.example",
        userAgent: "custom-agent/9.9",
        dynamicIds: false,
        headers: [
          { name: "x-app-key", value: "secret42" },
          { name: " x-trace ", value: " t1 " }, // sloppy input must be trimmed
          { name: "", value: "dropped" }, // empty name must be dropped
        ],
        enabled: true,
      },
    ],
    ...overrides,
  };
}

test("matching URL gets UA rewrite and custom headers", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = spyFetch;
  try {
    const { ctx, disposers } = makeDisposerCtx();
    await mod.default.apply(ctx, identityConfig());
    await globalThis.fetch("https://gateway.example/v1/chat", {
      headers: { authorization: "Bearer x" },
    });
    const h = new Headers(lastInit.headers);
    assert.equal(h.get("user-agent"), "custom-agent/9.9");
    assert.equal(h.get("x-app-key"), "secret42");
    assert.equal(h.get("x-trace"), "t1", "header name/value not trimmed");
    assert.equal(h.get("authorization"), "Bearer x", "existing header clobbered");
    assert.equal(h.get("x-opencode-client"), null, "dynamicIds leaked while disabled");
    for (const d of disposers.splice(0)) d();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("non-matching URL passes through untouched", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = spyFetch;
  try {
    const { ctx, disposers } = makeDisposerCtx();
    await mod.default.apply(ctx, identityConfig());
    await globalThis.fetch("https://api.other.com/v1", {
      headers: { "user-agent": "original/1" },
    });
    const h = new Headers(lastInit.headers);
    assert.equal(h.get("user-agent"), "original/1");
    assert.equal(h.get("x-app-key"), null);
    for (const d of disposers.splice(0)) d();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("patch is refcounted across applies and disposed exactly once", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = spyFetch;
  try {
    const { ctx, disposers } = makeDisposerCtx();
    await mod.default.apply(ctx, identityConfig());
    await mod.default.apply(ctx, identityConfig()); // second apply reuses wrapper
    for (const d of disposers.splice(0)) d();
    assert.equal(globalThis.fetch, spyFetch, "fetch not restored after all disposers ran");
    // Extra dispose calls must be harmless no-ops.
    for (const d of disposers) d();
    assert.equal(globalThis.fetch, spyFetch);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("enabled=false passes everything even with impossible limits", async () => {
  let downstream = 0;
  let mw;
  const ctx = {
    on(_ev, mwo) {
      mw = mwo;
    },
    get() {
      return undefined;
    },
    inject() {},
    effect() {},
  };
  await mod.default.apply(
    ctx,
    identityConfig({
      enabled: false,
      requestsPerMinute: 0.6, // would force waits if active
      burst: 1,
      mode: "wait",
      maxWaitMs: 60_000,
      identityRules: [],
    }),
  );
  const next = async function* () {
    downstream += 1;
    yield {};
  };
  const t0 = performance.now();
  await drain(mw({ provider: "p", model: "m" }, next));
  await drain(mw({ provider: "p", model: "m" }, next));
  const dt = performance.now() - t0;
  assert.equal(downstream, 2);
  assert.ok(dt < 200, `disabled limiter still throttled (${dt}ms)`);
});

// The canonical shape the free lane accepts: `ses_` + 12 lowercase hex
// (bit-inverted real-ms timestamp) + 14 Base62.
const CANONICAL_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

async function withIdentityPatch(fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = spyFetch;
  let disposer;
  try {
    const { ctx } = (disposer = makeDisposerCtx());
    await mod.default.apply(
      ctx,
      identityConfig({
        identityRules: [
          { urlPattern: "gateway.example", dynamicIds: true, enabled: true },
        ],
      }),
    );
    await fn();
    const { disposers } = disposer;
    for (const d of disposers.splice(0)) d();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function post(url, init) {
  return globalThis.fetch(url, { method: "POST", ...init });
}

test("dynamicIds emits the OpenCode v2 identity set", async () => {
  await withIdentityPatch(async () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "hello v2" }] });
    await post("https://gateway.example/v1/chat", { body });
    const h = new Headers(lastInit.headers);
    const session = h.get("x-opencode-session");
    assert.match(session, CANONICAL_RE, "session must be canonical");
    assert.equal(session.slice(13, 16), "ffe", "clock half uses the upstream counter-1 encoding");
    assert.equal(h.get("x-session-affinity"), session, "affinity mirrors the session");
    assert.equal(h.get("X-Session-Id"), session, "X-Session-Id mirrors the session");
    assert.equal(h.get("x-opencode-client"), "cli");
    assert.match(h.get("x-opencode-project"), /^prj_[0-9a-f]{24}$/);
    assert.equal(h.get("x-opencode-request"), null, "v2 does not send x-opencode-request");
  });
});

test("dynamicIds mints one session per conversation, not per request", async () => {
  await withIdentityPatch(async () => {
    const sessionOf = async (body) => {
      await post("https://gateway.example/v1/chat", { body });
      return new Headers(lastInit.headers).get("x-opencode-session");
    };
    const a = JSON.stringify({ messages: [{ role: "user", content: "conversation A" }] });
    // Same first user turn, longer history — must reuse the id.
    const aLonger = JSON.stringify({
      messages: [
        { role: "user", content: "conversation A" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "follow up" },
      ],
    });
    const b = JSON.stringify({ messages: [{ role: "user", content: "conversation B" }] });
    assert.equal(await sessionOf(a), await sessionOf(aLonger), "a conversation reuses its session");
    assert.notEqual(await sessionOf(a), await sessionOf(b), "distinct conversations must not collide");
  });
});

test("dynamicIds preserves a caller-supplied canonical session", async () => {
  await withIdentityPatch(async () => {
    // Official clients (and the opencode2dsh adapter) already carry a canonical
    // session; the Zen free lane 403s any other shape, so ours must not clobber it.
    const canonical = "ses_1a2b3c4d5e6fABCDEFGHIJKLMN";
    await post("https://gateway.example/v1/chat", {
      headers: { "x-opencode-session": canonical },
    });
    const h = new Headers(lastInit.headers);
    assert.equal(h.get("x-opencode-session"), canonical, "caller session must survive the patch");
    // The rest of the identity set is still filled in.
    assert.equal(h.get("x-session-affinity"), canonical);
    assert.equal(h.get("X-Session-Id"), canonical);
    assert.equal(h.get("x-opencode-client"), "cli");
  });
});

test("dynamicIds canonicalizes a non-canonical caller session", async () => {
  await withIdentityPatch(async () => {
    // A foreign/legacy client session (here a plain ULID) would 403 the free
    // lane, so it is replaced by a canonical id rather than preserved.
    const notCanonical = "ses_01JD5Z3K8Q9Y2M4N6P7R8S9T0V";
    await post("https://gateway.example/v1/chat", {
      headers: { "x-opencode-session": notCanonical },
    });
    const h = new Headers(lastInit.headers);
    const session = h.get("x-opencode-session");
    assert.match(session, CANONICAL_RE);
    assert.notEqual(session, notCanonical, "a non-canonical session must be replaced");
    assert.equal(h.get("x-session-affinity"), session);
  });
});
