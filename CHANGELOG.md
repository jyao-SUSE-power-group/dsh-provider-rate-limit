# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Live `queuedNow` gauge: real-time queue depth in per-route and aggregate stats (not reset by `resetStats`; returns to `0` the moment a wait ends).
- SSE push endpoint `/api/provider-rate-limit.events`: streams a fresh stats snapshot on every counter change with a 15 s heartbeat, replacing 5 s client polling. Client falls back to a 30 s poll only if the stream drops.

### Changed
- Settings card primary value now shows live queue depth (`当前排队`) with the cumulative count (`累计排队`) as the sub-line; composer dock subscribes to the reactive stats store instead of a 1 s local tick.

## [0.2.2] - 2026-08-23

### Changed
- Renamed package and all internal identifiers (`llm-rate-limit` → `provider-rate-limit`) so the plugin can coexist with the unrelated `dsh-llm-rate-limit` npm package that registers the same cordis plugin id. One-time effect: settings stored under the old namespace reset to defaults.

### Added
- Custom static headers per identity rule (`Name: Value` pairs, trimmed, applied after the UA rewrite).
- `enabled` master switch checked per request — flipping it needs no listener re-registration.

## [0.2.1] - 2026-08

### Changed
- Token bucket rewritten to a reservation-based design: exact synchronous wait computation, strict FIFO by arrival order, no polling. Cancelled reservations are deliberately not refunded (conservative quota).
- Config route hardened: loopback Host + same-origin checks (anti CSRF/DNS-rebinding), 64 KB body cap.
- Identity fetch patch is ref-counted; dispose restores native fetch exactly once and never clobbers a patch layered above it.
- Monotonic clock (`performance.now()`) for all rate math.

### Fixed
- Settings card: provider select keeps the stored value when absent from options; split error rendering for config vs identity validation; maxWaitMs validation; reset confirmation guard.

## [0.1.x] - 2026-08

### Added
- Initial release: per `(provider, model)` token-bucket limiting on the `llm/stream` waterfall, wait/reject modes with `providerRetryAfterMs`, gateway identity rules with OpenCode Zen preset, bilingual settings card.
