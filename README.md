# dsh-provider-rate-limit

English | [简体中文](./README.zh-CN.md)

Per-provider **&** per-model rate limiting for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) LLM traffic, plus gateway identity rules (client spoofing) for restricted free-tier gateways.

适用于 DeepSeek Harness 的按供应商/模型粒度 LLM 限速插件，附带网关身份规则（客户端伪装）能力。

## Features

- **Token-bucket rate limiting** per `(provider, model)` route — smooth refill with burst support, idle-time recovery
- **Two modes** when the bucket is empty:
  - `wait` — hold the request up to `maxWaitMs`, then let it through (transparent queueing)
  - `reject` — short-circuit immediately with a synthetic `RATE_LIMIT` response carrying `providerRetryAfterMs`
- **Strict FIFO** — reservation-based design guarantees same-order admission without polling
- **Gateway identity rules** — rewrite `User-Agent` / inject static headers for URLs matching a pattern (e.g. gateways that validate client identity), with a one-click **OpenCode Zen** preset
- **Master switch** — flip `enabled` off to pass all traffic instantly, no listener re-registration
- **Settings UI card** — full configuration from the Harness settings page, zh/en localized
- **Live stats line** — compact readout in the composer dock (under the chat input), SSE-pushed in real time (no polling); hover to see per-route provider·model breakdown
- **SSE push endpoint** — `GET /api/provider-rate-limit.events` streams a fresh stats snapshot every time counters change, with a 15 s heartbeat and automatic reconnection
- **Stats HTTP API** — `GET /api/provider-rate-limit.stats` returns aggregate and per-route counters as JSON (used by the dock line; also available for external tooling)
- **Cross-plugin stats service** — `provider-rate-limit/stats` service for in-process consumers (getStats, getAllStats, getAggregateStats, resetStats)
- **O(1) route lookup** — pre-built Map for rule matching instead of linear scan
- **Standard ULID** — 26-char Crockford base-32 IDs (48-bit big-endian time + 80-bit random)

## Install

### DSH plugin manager (recommended)

```bash
dsh plugin --profile web add github:jyao-SUSE-power-group/dsh-provider-rate-limit
```

Then restart DeepSeek Harness. The plugin registers itself into the `llm` service via its cordis patch.

### Manual

```bash
git clone https://github.com/jyao-SUSE-power-group/dsh-provider-rate-limit.git ~/.dsh/plugins/dsh-provider-rate-limit
cd ~/.dsh/plugins/dsh-provider-rate-limit && pnpm install --prod
```

## Configuration

Open **Settings → 插件 → Provider Rate Limit**. All options hot-reload — no restart needed.

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Master switch; `false` passes everything untouched |
| `requestsPerMinute` | `20` | Global steady-state rate (applies when no route rule matches); `0` = unlimited |
| `burst` | `4` | Bucket capacity — how many requests may fire back-to-back |
| `mode` | `wait` | `wait` = queue up to `maxWaitMs`; `reject` = fail fast |
| `maxWaitMs` | `30000` | Longest queue time in `wait` mode before falling back to `reject` behavior |
| `upstream429Backoff` | `true` | On an upstream HTTP 429 (e.g. quota exhausted), pause the route until the window passes |
| `backoffMs` | `30000` | Initial cooldown (ms) when the upstream 429 carries no `Retry-After`; doubles on consecutive 429s up to `maxBackoffMs` |
| `maxBackoffMs` | `60000` | Maximum cooldown ceiling (ms) for exponential backoff; `0` = fixed cooldown (same as `backoffMs`) |
| `backoffJitter` | `0` | Symmetric jitter ratio (0–1) applied to the cooldown to prevent thundering herd; `0` = deterministic |
| `maxConcurrentRequests` | `0` | Maximum in-flight requests per route; `0` = unlimited concurrency |
| `models` | `[]` | Per-route overrides: match by provider/model substring, each with its own RPM/burst |

### Route rules

Route rules match on substrings of the resolved provider id and model name, e.g. provider `opencode` + model `claude-*`. The most specific matching rule wins; unmatched traffic uses the global limits.

### Identity rules

Some free-tier gateways (e.g. OpenCode Zen) reject clients whose requests don't look like their official tooling. Identity rules let selected outbound URLs carry a different identity:

- `urlPattern` — substring match against the request URL
- `userAgent` — replacement `User-Agent`
- `dynamicIds` — adds the per-request `x-opencode-client/project/session/request` header set
- `headers` — arbitrary static headers (`Name: Value` pairs), applied last so they can override everything above

The fetch patch is ref-counted and unwinds cleanly: when the plugin deactivates, native `fetch` is restored exactly once, and a patch layered above ours in the meantime is never clobbered.

> ⚠️ Only spoof identities for services you are legitimately entitled to use, and in accordance with their terms.

## How it works

Every outbound LLM stream passes through one `llm/stream` hook (a waterfall choke point covering agent loops, title generation, and compaction). Each call synchronously *reserves* a slot in the route's token bucket:

```
waitMs = bucket.reserve()        // exact wait, computed from a monotonic floor
if waitMs === 0                  → pass through immediately
else if mode=wait && ≤ maxWaitMs → sleep(waitMs), then pass
else                             → yield RATE_LIMIT finish (+ Retry-After hint)
```

The bucket floor is `now − (capacity − 1) × interval`, which gives classic burst-and-recover semantics: after idle time the bucket is implicitly full again, and resizing capacity/rate at runtime never mints a free burst.

### Upstream 429 backoff

When the upstream provider answers with an HTTP 429 (e.g. workspace quota exhausted), the plugin watches the finish event and, if `upstream429Backoff` is on, puts that route into a **cooldown window**. New requests to that route queue (in `wait` mode, up to `maxWaitMs`) or reject (in `reject` mode) until the window passes, so the provider isn't hammered while it's already rejecting us. The window is `providerRetryAfterMs` (from the upstream `Retry-After` header) when present; otherwise `backoffMs` is used as the initial delay. On consecutive 429s without an intervening success, the delay doubles each time (exponential backoff), capped at `maxBackoffMs`. A symmetric `backoffJitter` ratio randomises the final value to prevent thundering herd. A successful (non-429) finish resets the backoff counter back to the base delay. The 429 finish itself is still forwarded, so `dsh-llm-retry` can also act on it.

### Concurrency limiting

When `maxConcurrentRequests > 0`, the plugin additionally gates how many requests to a route may be in flight simultaneously. Requests that pass the RPM check but find all concurrency slots occupied wait (polling every 100 ms) until a slot frees up. This prevents a burst of parallel agents or subagents from overwhelming a provider even when individual RPM limits haven't been reached. `0` means unlimited concurrency (only RPM throttles).

## Live Stats

The plugin renders a compact stats line in the **composer dock** (below the chat input):

```
限流统计 已拒绝 0 · 当前排队 0 · 累计排队 0 · 平均等待 — · 总请求 153 · 活跃路由 3
```

Hover over the line to see a per-route breakdown (provider·model + request count). The data is pushed in real time over SSE — the dock subscribes to the reactive stats store, so numbers jump the moment a request queues, rejects, or completes. No polling timers are involved; a 30 s fallback poll only kicks in if the SSE connection drops.

### Push Endpoint (SSE)

```
GET /api/provider-rate-limit.events
```

A Server-Sent Events stream. Each frame is a complete stats snapshot:

```text
data: {"aggregate":{"reserved":153,"waited":0,"totalWaitMs":0,"rejected":0,"queuedNow":0,"avgWaitMs":0,"routes":3},"routes":{...}}

```

A snapshot is sent immediately on connect, then again whenever counters move (request reserved, queue depth changed, request rejected or completed). The server also emits a `: ping` comment every 15 s to keep the connection alive through proxies.

### Stats HTTP API

```
GET /api/provider-rate-limit.stats
```

Returns:

```json
{
  "ok": true,
  "value": {
    "aggregate": { "reserved": 153, "waited": 0, "totalWaitMs": 0, "rejected": 0, "queuedNow": 0, "avgWaitMs": 0, "routes": 3 },
    "routes": {
      "opencode\u0000big-pickle": { "reserved": 117, "waited": 0, "queuedNow": 0, ... },
      "opencode-vision\u0000big-pickle": { "reserved": 34, ... },
      "amd-r\u0000DeepSeek-V4-Flash": { "reserved": 2, ... }
    }
  }
}
```

`queuedNow` is the **live queue depth** — how many requests are currently waiting in the rate-limit queue this instant (back to `0` as soon as the wait ends). `waited` remains the cumulative counter; the settings card shows both.

## Cross-Plugin Stats API

Other plugins can query rate-limit statistics:

```js
// In a plugin's apply(ctx):
const stats = ctx.get("provider-rate-limit/stats");

// Per-route stats
const routeStats = stats.getStats("opencode", "deepseek-v4-flash-free");
// → { reserved, waited, totalWaitMs, rejected, queuedNow, avgWaitMs, peekWaitMs }

// All routes
const all = stats.getAllStats();
// → { "opencode\u0000deepseek-v4-flash-free": {...}, ... }

// Aggregate across all routes
const agg = stats.getAggregateStats();
// → { reserved, waited, totalWaitMs, rejected, queuedNow, avgWaitMs, routes }

// Reset counters (for per-window accounting)
stats.resetStats();              // all routes
stats.resetStats("opencode", "v3"); // specific route
```

## Development

```bash
pnpm install
npm test   # 23 tests: bucket behavior, FIFO, abort/reject, identity patch,
           # dispose, master switch, ULID format, stats service, multi-provider,
           # maxWaitMs timeout, hot-update retune, queuedNow gauge, error handling
```

## Screenshots

### Settings Card

![Settings Card](./assets/screenshots/settings-card.png)

### Settings Configuration

| | |
|---|---|
| ![Settings Config 1](./assets/screenshots/settings-config-1.png) | ![Settings Config 2](./assets/screenshots/settings-config-2.png) |

### Composer Dock Live Stats

![Composer Dock Stats](./assets/screenshots/composer-dock-stats.png)

## License

[MIT](./LICENSE)
