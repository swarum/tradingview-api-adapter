# Migration Guide: 1.x → 2.0

> **Status:** in progress. This guide will be completed as the V2 API lands
> across phases 1–7 of the V2 rollout.

V2 is a full rewrite with a new public API. The 1.x API (`TvApiAdapter`,
`Quote`, `QuoteChannel`, `TickerDetails`) is removed entirely.

## Quick reference

| 1.x | 2.0 |
| --- | --- |
| `new TvApiAdapter()` | `tv()` |
| `adapter.Quote(ticker, market, fields).listen(cb)` | `client.symbol(market + ':' + ticker).stream(fields).on('update', cb)` |
| `adapter.QuoteChannel({ ex: [...] }, fields).listen(cb)` | `client.createGroup('name', [...]).stream(fields).on('update', cb)` |
| `adapter.TickerDetails(ticker, market).ready(cb)` | `await client.symbol(market + ':' + ticker).info()` |
| _(no way to close)_ | `await client.disconnect()` |

## Breaking changes

- Minimum Node version is now **20** (was 14).
- Package is now ESM-first with a CJS build. `import` works natively;
  `require` still works via the `.cjs` build.
- The `TvApiAdapter` class is removed. Use the `tv()` factory.
- All streaming callbacks now receive a **single object argument**, not
  positional arguments.
- `Quote` / `QuoteChannel` / `TickerDetails` classes are removed.

## Why the redesign

_To be written in Phase 7._

---

Detailed migration examples and API-by-API breakdown will be added as each
phase lands. Track progress in `docs/CHANGELOG.md` and the `v2` branch.
