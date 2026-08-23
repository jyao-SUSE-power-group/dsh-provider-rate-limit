/**
 * Behavioral suite: reservation token bucket, FIFO order, abort and reject
 * semantics on the llm/stream waterfall.
 */
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

import { drain, loadPlugin, makeHooksCtx } from "./helpers.js";

const mod = await loadPlugin();

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    requestsPerMinute: 60,
    burst: 1,
    mode: "wait",
    maxWaitMs: 10_000,
    models: [],
    identityRules: [],
    ...overrides,
  };
}

test("registers the llm/stream hook as a global prepend", async () => {
  const ctx = makeHooksCtx();
  const hooks = ctx.hooks;
  await mod.default.apply(ctx, baseConfig());
  const entry = hooks["llm/stream"];
  assert.ok(entry, "llm/stream hook not registered");
  assert.deepEqual(entry.opts, { global: true, prepend: true });
});

test("burst token passes instantly, next request waits one refill interval", async () => {
  const ctx = makeHooksCtx();
  const hooks = ctx.hooks;
  await mod.default.apply(ctx, baseConfig({ requestsPerMinute: 60 }));
  let downstream = 0;
  const next = async function* () {
    downstream += 1;
    yield { type: "text", text: "ok" };
  };
  const mw = hooks["llm/stream"].mw;

  const t0 = performance.now();
  const first = await drain(mw({ provider: "p", model: "m" }, next));
  const dtFirst = performance.now() - t0;
  assert.equal(downstream, 1);
  assert.equal(first.length, 1);
  assert.ok(dtFirst < 200, `burst pass took ${dtFirst}ms`);

  const t1 = performance.now();
  await drain(mw({ provider: "p", model: "m" }, next));
  const dtSecond = performance.now() - t1;
  assert.equal(downstream, 2);
  // rpm=60 → ~1000ms/token; a fast pass would mean the limiter is broken.
  assert.ok(dtSecond >= 900, `waited only ${dtSecond}ms for refill`);
});

test("concurrent waiters complete in strict FIFO arrival order", async () => {
  const ctx = makeHooksCtx();
  const hooks = ctx.hooks;
  await mod.default.apply(ctx, baseConfig());
  const next = async function* () {
    yield {};
  };
  const mw = hooks["llm/stream"].mw;

  await drain(mw({ provider: "f", model: "x" }, next)); // exhaust burst
  const order = [];
  const enter = (id) =>
    (async () => {
      await drain(
        mw({ provider: "f", model: "x" }, async function* () {
          order.push(id);
          yield {};
        }),
      );
    })();
  const b = enter("B");
  await sleep(5);
  const c = enter("C");
  await Promise.all([b, c]);
  assert.equal(order.join(","), "B,C", `FIFO violated: ${order.join(",")}`);
});

test("abort mid-wait terminates with RATE_LIMIT finish and retry hint", async () => {
  const ctx = makeHooksCtx();
  const hooks = ctx.hooks;
  await mod.default.apply(ctx, baseConfig());
  const next = async function* () {
    yield {};
  };
  const mw = hooks["llm/stream"].mw;

  await drain(mw({ provider: "a", model: "z" }, next)); // exhaust
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 150);
  const t0 = performance.now();
  const out = await drain(mw({ provider: "a", model: "z", signal: ac.signal }, next));
  const dt = performance.now() - t0;
  const finish = out.find((e) => e?.type === "finish");
  assert.ok(finish, "no finish event yielded");
  assert.equal(finish.reason.failure.code, "RATE_LIMIT");
  assert.ok(finish.reason.failure.providerRetryAfterMs > 0, "missing providerRetryAfterMs");
  assert.ok(dt < 1000, `abort took ${dt}ms to propagate`);
});

test("reject mode short-circuits without touching downstream", async () => {
  const ctx = makeHooksCtx();
  const hooks = ctx.hooks;
  await mod.default.apply(ctx, baseConfig({ requestsPerMinute: 6, mode: "reject" }));
  const mw = hooks["llm/stream"].mw;
  let downstream = 0;
  const next = async function* () {
    downstream += 1;
    yield {};
  };

  await drain(mw({ provider: "r", model: "j" }, next));
  const t0 = performance.now();
  const out = await drain(mw({ provider: "r", model: "j" }, next));
  const dt = performance.now() - t0;
  assert.equal(downstream, 1, "second call leaked into downstream in reject mode");
  assert.ok(dt < 500, `reject waited ${dt}ms`);
  assert.equal(out.at(-1)?.reason?.failure?.code, "RATE_LIMIT");
});
