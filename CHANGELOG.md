# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-04-10

First release of the V2 architecture. Complete rewrite with a new
public API, full TypeScript types, and a clean lifecycle model.

See [MIGRATION.md](./MIGRATION.md) for the full 1.x → 2.0 guide.

### Added

#### Public API

- `tv(options)` factory function returning a `Client`.
- `Client` with lifecycle (`connect`, `disconnect`, events, `Symbol.asyncDispose`).
- `TvSymbol` with `price()`, `snapshot()`, `info()`, `candles()`, `stream()`.
- `Stream` with typed events (`price`, `change`, `update`, `bar`, `error`),
  `Symbol.dispose`, and `Symbol.asyncIterator`.
- `Portfolio` — ad-hoc multi-symbol collection (`client.symbols([...])`).
- `Group` — named, mutable collection with live `add` / `remove` /
  `has` / `clear` propagating to active streams.
- `GroupRegistry` — `Map`-like container at `client.groups`.
- `MultiStream` — shared multi-symbol stream base used by `Portfolio`,
  `Group`, and `client.stream()`.
- `client.stream()` — aggregate multi-symbol stream with automatic
  dedup across overlapping groups.
- Full typed quote field system:
  `QuoteField`, `QuoteFieldTypeMap`, `QuoteSnapshot<F>`,
  `FullQuoteSnapshot`, `TradeTick`, `BarTick`.
- Candle types: `Candle`, `Timeframe`, `RawTimeframe`,
  `TimeframeAlias`, `normalizeTimeframe`.
- `SymbolInfo` with camelCase fields and an index signature for
  forward-compatibility.
- Error hierarchy: `TvError`, `TvConnectionError`, `TvProtocolError`,
  `TvSessionError`, `TvSymbolError`, `TvTimeoutError`.

#### Internal API

The `tradingview-api-adapter/internal` subpath exports low-level
primitives for advanced users. **These are semver-exempt** — breaking
changes may happen in minor versions.

- `Transport` — WebSocket lifecycle with reconnect and buffering.
- `Protocol` — pure `encodeFrame`/`decodeFrames`/`encodeCommand`/`encodeHeartbeat`.
- `SessionManager` — transport owner, heartbeat, routing, replay.
- `QuoteSession` / `ChartSession` — TradingView session logic.
- `SymbolBatcher` — the rate limiter used to coalesce add/remove ops.
- Utilities: `calculateBackoff`, `randomId`, `createLogger`,
  `kebabToCamel`, `transformKeys`, `symbolInfoFromRaw`.

#### Resilience

- Automatic reconnect with exponential backoff + jitter.
- Session replay: quote and chart sessions are re-registered after
  reconnect so consumer code never sees the outage.
- Heartbeat auto-response handled inside `SessionManager`.
- Rate limiter with 50 ms micro-batching, 50-symbol chunks, and
  cancel-within-window dedup (`add('X') + remove('X')` in the same
  window emits nothing).

#### Authentication

- `auth.sessionid` / `auth.sessionidSign` — sent as `Cookie` header
  on the WebSocket handshake (Node only).
- `auth.authToken` — sent via `set_auth_token` message after the
  server hello, defaults to `"unauthorized_user_token"`.
- `locale` option — sent via `set_locale` after auth.

#### Browser / dual runtime

- Dynamic `import('ws')` so browser bundlers drop the Node `ws`
  package from client builds.
- Automatic runtime detection: native `WebSocket` in browsers,
  `ws` in Node, fallback to native in Bun / Deno / Cloudflare Workers.
- `happy-dom` test environment for browser smoke tests.

#### Proxy support

- `agent` option accepted by `tv()`, propagated through to the `ws`
  package. Works with `https-proxy-agent`, `socks-proxy-agent`, or
  any `http.Agent`-compatible proxy client.

#### Documentation

- Rewritten README with quick start, feature list, and examples table.
- `docs/getting-started.md` — installation, concepts, troubleshooting.
- `docs/api/` — full reference for `Client`, `TvSymbol`, `Stream`,
  `Portfolio` / `Group`, and types.
- `docs/guides/` — streaming, candles, groups, reconnect, browser,
  proxy, auth.
- `MIGRATION.md` — complete 1.x → 2.0 migration guide.
- `CONTRIBUTING.md` — development workflow, `.js` extension rationale.

#### Examples

12 runnable demos in `examples/`:

1. `01-single-price.ts`
2. `02-streaming.ts`
3. `03-multi-symbol.ts`
4. `04-groups.ts`
5. `05-candles-history.ts`
6. `06-candles-streaming.ts`
7. `07-symbol-info.ts`
8. `08-async-iterator.ts`
9. `09-reconnect-resilience.ts`
10. `10-browser.html`
11. `11-proxy-node.ts`
12. `12-auth-session.ts`

#### Testing and tooling

- 227+ unit tests across 21 files in `tests/unit/`.
- Mock WebSocket server in `tests/fixtures/ws-server.ts` for
  integration-like tests without touching the network.
- Live e2e scaffolding gated by `LIVE_E2E=1` environment variable.
- Vitest + `@vitest/coverage-v8` with 85% statement threshold.
- ESLint 9 (flat config) + Prettier.
- `tsup` dual ESM + CJS build with `.d.ts` and `.d.cts` types.
- `publint` pre-publish validation.
- GitHub Actions CI (Node 20 & 22), nightly e2e, tag-triggered
  release workflow with npm provenance.

### Changed

- Minimum Node version: **20** (was 14).
- Package is now ESM-first (`"type": "module"`) with a CJS fallback.
- `keywords` in `package.json` trimmed to 10 honest entries from 12
  (removed `tradingview-webhooks`, `tradingview-indicator`,
  `bitcoin`, `dogecoin`, and de-duplicated stock-related keywords).
- Security: upgraded `ws` to `^8.18.0` (fixes
  [GHSA-3h5v-q93c-6h6q](https://github.com/advisories/GHSA-3h5v-q93c-6h6q)).

### Removed

- Legacy 1.x source code: `src/Client.ts`, `src/Quote.ts`,
  `src/QuoteChannel.ts`, `src/TickerDetails.ts`, `src/WsProtocol.ts`,
  `src/adapters/*`, `demos/*`. Replaced by the new architecture.

### Fixed

- [#4](https://github.com/swarum/tradingview-api-adapter/issues/4) —
  Unable to close WS connection. `client.disconnect()` now releases
  every resource and allows the Node process to exit.
- [#5](https://github.com/swarum/tradingview-api-adapter/discussions/5) —
  Unclear `trade` / `minute-bar` / `daily-bar` types. The
  `QuoteFieldTypeMap` now declares full `TradeTick` and `BarTick`
  interfaces with TypeScript checking.
- [#6](https://github.com/swarum/tradingview-api-adapter/issues/6) —
  Mobile browser quotes. Browser detection now uses the native
  `WebSocket` when available and the `ws` package is dropped from
  browser bundles via dynamic import.
- [#7](https://github.com/swarum/tradingview-api-adapter/issues/7) —
  Vue 3 WebSocket error. Same dynamic import fix.
- [#9](https://github.com/swarum/tradingview-api-adapter/issues/9) —
  Proxy server. `agent` option now propagates through the full
  `Client` → `SessionManager` → `Transport` stack.
