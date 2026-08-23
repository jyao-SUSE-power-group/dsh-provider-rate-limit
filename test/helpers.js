/**
 * Shared fakes for driving the plugin outside a live cordis host.
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadPlugin() {
  return import(pathToFileURL(path.join(pluginRoot, "lib", "index.js")).href);
}

/** Collect middleware registrations: event -> { mw, opts }. */
export function makeHooksCtx(extra = {}) {
  const hooks = {};
  return {
    hooks,
    on(ev, mw, opts) {
      hooks[ev] = { mw, opts };
    },
    get() {
      return undefined;
    },
    inject() {},
    // Real cordis calls fn immediately and treats a returned function as the
    // disposable (see cordis _execute); emulate that so dispose paths work.
    effect(fn) {
      const result = fn();
      if (typeof result === "function") result.disposer = true;
    },
    ...extra,
  };
}

/** Ctx variant whose effect() queues disposers for manual unwinding. */
export function makeDisposerCtx() {
  const disposers = [];
  const ctx = makeHooksCtx({
    effect(fn) {
      const result = fn();
      disposers.push(typeof result === "function" ? result : fn);
    },
  });
  return { ctx, disposers };
}

/** Drain a middleware generator, returning yielded events. */
export async function drain(gen) {
  const out = [];
  for (;;) {
    const r = await gen.next();
    if (r.done) break;
    out.push(r.value);
  }
  return out;
}
