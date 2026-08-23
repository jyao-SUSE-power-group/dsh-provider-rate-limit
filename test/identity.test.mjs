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
    const { ctx } = makeDisposerCtx();
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
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("non-matching URL passes through untouched", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = spyFetch;
  try {
    const { ctx } = makeDisposerCtx();
    await mod.default.apply(ctx, identityConfig());
    await globalThis.fetch("https://api.other.com/v1", {
      headers: { "user-agent": "original/1" },
    });
    const h = new Headers(lastInit.headers);
    assert.equal(h.get("user-agent"), "original/1");
    assert.equal(h.get("x-app-key"), null);
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
