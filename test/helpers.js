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
export function makeHooksCtx(extra = {}, { withLegacyProvider = false } = {}) {
  const hooks = {};
  return {
    hooks,
    on(ev, mw, opts) {
      hooks[ev] = { mw, opts };
    },
    get() {
      return undefined;
    },
    inject(deps, cb) {
      // Emulate a real cordis settings provider so the plugin's install path
      // fires its initial onChange(), building the route rules map from the
      // config passed to apply(). In production DSH the host provides this;
      // the test fakes it so per-route (models) rules take effect immediately.
      // `withLegacyProvider` forces the pre-0.1.2-alpha.2 fallback path (no
      // installSection method, only register) for compatibility coverage.
      if (deps && deps.includes("settings")) {
        const scope = {
          value: null,
          watchers: [],
          get() { return this.value; },
          watch(cb) { this.watchers.push(cb); },
        };
        const settings = {
          register(_ns, _schema, opts) {
            scope.value = opts.base;
            return scope;
          },
        };
        if (!withLegacyProvider) {
          settings.installSection = (_owner, _ns, _schema, entry, hooks) => {
            settings.register(_ns, _schema, { base: entry });
            hooks.setSource(() => scope.get());
            hooks.onChange();
            scope.watch(() => hooks.onChange());
          };
        }
        cb({ settings, effect: (fn) => { const r = fn(); if (typeof r === "function") r.disposer = true; } });
      }
    },
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
