# Migration Guide: 1.x → 2.0

V2 is a full rewrite. The 1.x classes (`TvApiAdapter`, `Quote`,
`QuoteChannel`, `TickerDetails`) are removed and replaced with a
single fluent API built around `tv()`, `Client`, `TvSymbol`,
`Stream`, `Portfolio`, and `Group`.

This guide walks through every 1.x method and its 2.0 equivalent.

## Quick reference

| 1.x | 2.0 |
| --- | --- |
| `new TvApiAdapter()` | `tv()` |
| `adapter.Quote(ticker, market, fields).listen(cb)` | `client.symbol(`market`:`ticker`).stream(fields).on('update', cb)` |
| `adapter.QuoteChannel({ ex: [...] }, fields).listen(cb)` | `client.createGroup('name', [...]).stream(fields).on('update', cb)` |
| `adapter.QuoteChannel([...], fields).listen(cb)` | `client.symbols([...]).stream(fields).on('update', cb)` |
| `adapter.TickerDetails(ticker, market).ready(cb)` | `await client.symbol(market+':'+ticker).info()` |
| `.pause()` / `.resume()` | `stream.close()` / open a new stream |
| *(no way to close)* | `await client.disconnect()` |

## Breaking changes

- **Node ≥ 20 required.** V1 worked on Node 14+; V2 uses `using`
  and `Symbol.asyncDispose` which need Node 20+.
- **ESM-first.** V2 is published as dual ESM + CJS, but the primary
  build target is ESM. CommonJS still works via `require()`.
- **Callbacks always receive a single object argument.** V1 passed
  raw data; V2 wraps it in typed event payloads like
  `{ price }` or `{ symbol, data }`.
- **Pooled symbol instances.** V1 created a new `Quote` every time.
  V2's `client.symbol(pair)` returns the same instance on repeat
  calls, so subscriptions pool naturally.
- **Strict TypeScript types.** V1's `QuoteChannel` returned
  `Record<string, any>`. V2's `QuoteSnapshot<['lp', 'bid']>` gives
  you `{ lp?: number | null; bid?: number | null }` at compile time.
- **Removed classes.** `TvApiAdapter`, `Quote`, `QuoteChannel`, and
  `TickerDetails` are gone. The functionality is split across
  `Client`, `TvSymbol`, `Stream`, `Portfolio`, `Group`, and the
  internal session classes.

## Method-by-method migration

### Creating a client

**1.x:**
```ts
import { TvApiAdapter } from 'tradingview-api-adapter'

const adapter = new TvApiAdapter()
```

**2.0:**
```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
```

### Single-symbol quotes

**1.x:**
```ts
const btc = adapter.Quote('BTCUSD', 'BINANCE', ['lp', 'ch', 'chp'])

btc.listen((data, flags) => {
  console.log(data.lp)
  if (flags.firstLoad) console.log('initial snapshot')
})
```

**2.0:**
```ts
const btc = client.symbol('BINANCE:BTCUSD')
const stream = btc.stream(['lp', 'ch', 'chp'] as const)

stream.on('update', ({ symbol, data }) => {
  console.log(data.lp)
})

// First-load signal is no longer on the event. If you need it,
// use snapshot() which resolves after the initial load completes:
await btc.snapshot(['lp'] as const) // waits for first load
```

Note the reversed symbol format: V1 used `ticker, market`, V2 uses
`market:ticker` (matching TradingView's native convention).

### Multi-symbol quote channels

**1.x (object syntax):**
```ts
const ch = adapter.QuoteChannel(
  {
    BINANCE: ['BTCUSDT', 'ETHUSDT'],
    MUN: ['APC'],
  },
  ['lp', 'bid', 'ask'],
)

ch.listen((data) => {
  console.log(data.BINANCE.BTCUSDT.lp)
})
```

**2.0 (Portfolio for ad-hoc, Group for named):**
```ts
// Option A: Portfolio (ad-hoc)
const portfolio = client.symbols([
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'MUN:APC',
])

portfolio.stream(['lp', 'bid', 'ask'] as const).on('update', ({ symbol, data }) => {
  console.log(symbol, data.lp)
})

// Option B: Group (named, mutable)
const g = client.createGroup('tickers', [
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
])
g.add('MUN:APC')

g.stream(['lp', 'bid', 'ask'] as const).on('update', ({ symbol, data }) => {
  console.log(symbol, data.lp)
})
```

**1.x (array syntax):**
```ts
const ch = adapter.QuoteChannel(
  ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'MUN:APC'],
  ['lp', 'bid', 'ask'],
)
```

**2.0:**
```ts
const portfolio = client.symbols([
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'MUN:APC',
])
```

### Adding / removing fields

**1.x:**
```ts
quote.addFields(['volume'])
quote.removeFields(['ch'])
quote.setFields(['lp', 'bid'])
```

**2.0:**

V2 has no `addFields`/`removeFields` — the field set is defined at
stream creation and is immutable for that stream. If you need to
change fields, close the stream and open a new one:

```ts
stream.close()
const newStream = btc.stream(['lp', 'bid'] as const)
```

Or use `snapshot()` for one-off queries with different field sets:

```ts
await btc.snapshot(['lp'] as const) // just the price
await btc.snapshot(['volume', 'ch'] as const) // just volume and change
```

### Pause / resume

**1.x:**
```ts
quote.pause()
// later
quote.resume()
```

**2.0:**

V2 has no `pause`/`resume`. Close the stream when you don't need
updates, reopen when you do:

```ts
stream.close()
// later
const newStream = btc.stream(['lp'] as const)
```

Because `TvSymbol` is pooled, the underlying subscription state is
cached — reopening is cheap.

### Ticker details / symbol metadata

**1.x:**
```ts
const details = adapter.TickerDetails('DOGEUSD', 'Binance')
details.ready((info) => {
  console.log(info.description)
  console.log(info.seriesKey)
})
```

**2.0:**
```ts
const doge = client.symbol('BINANCE:DOGEUSD')
const info = await doge.info()
console.log(info.description)
console.log(info.seriesKey)
```

The returned object is a proper camelCase `SymbolInfo` with full
TypeScript typing. V1 had a manually-mapped interface; V2 uses an
automatic kebab/snake → camel converter and a well-documented type
definition.

### Disconnecting

**1.x:**

V1 had no clean way to close a connection ([issue #4](https://github.com/swarum/tradingview-api-adapter/issues/4)).
The Node process would hang waiting for the WebSocket.

**2.0:**
```ts
await client.disconnect()

// or with using (Node 20+):
using client = tv()
// auto-disconnects on scope exit
```

Every resource — streams, groups, symbols, sessions, transport — is
released cleanly.

## New in V2

### Historical candles

V1 had no candles API. V2 adds:

```ts
const btc = client.symbol('BINANCE:BTCUSDT')

const bars = await btc.candles({ timeframe: '1h', count: 100 })
// → Candle[] with { time, open, high, low, close, volume }
```

### Typed snapshots

V1 returned raw TradingView data. V2 gives you typed snapshots:

```ts
const snap = await btc.snapshot(['lp', 'bid', 'ask'] as const)
snap.lp // → number | null | undefined
snap.bid // → number | null | undefined
```

### One-shot `price()`

V1 required a `Quote` + `listen` + manual capture. V2:

```ts
const price = await btc.price() // → number
```

### Async iteration

V2 `Stream` implements `Symbol.asyncIterator`:

```ts
for await (const { data } of btc.stream()) {
  if (data.lp > 70000) break // auto-closes
}
```

### Reconnect

V1 had no reconnect logic. V2 has automatic exponential backoff +
jitter, full session replay, and configurable `maxAttempts`:

```ts
const client = tv({
  reconnect: { maxAttempts: 20, initialDelayMs: 500 },
})

client.on('reconnect', ({ attempt }) => console.log(attempt))
```

### Auth, proxy, browser

V2 adds first-class support for:

- Proxy via `agent` option (see [proxy guide](docs/guides/proxy.md))
- TradingView credentials via `auth.sessionid` / `auth.authToken` (see [auth guide](docs/guides/auth.md))
- Browser usage via dynamic `ws` import (see [browser guide](docs/guides/browser.md))

### Dedup across groups

If the same symbol belongs to multiple groups, `client.stream()`
fires **one event per tick**, not one per group. This comes for
free from pooled `TvSymbol` instances.

## Migration strategy

1. **Bump to Node 20+.** Run `node --version` to check.
2. **Install 2.0:** `npm install tradingview-api-adapter@2`
3. **Rename `new TvApiAdapter()` → `tv()`.** Global find-and-replace.
4. **Flip symbol format.** Change `('BTCUSD', 'BINANCE', ...)` to
   `('BINANCE:BTCUSD')`. Use `sed` or your IDE's regex replace.
5. **Replace `Quote` + `listen` with `symbol` + `stream` + `on('update', ...)`.**
6. **Replace `QuoteChannel` with `symbols` or `createGroup`.**
7. **Replace `TickerDetails + ready` with `await symbol.info()`.**
8. **Add `await client.disconnect()` before your process exits.**
9. **Run your tests.** TypeScript will catch most remaining issues.

Most codebases can migrate in under an hour.

## Getting help

- [Issues](https://github.com/swarum/tradingview-api-adapter/issues)
- [Discussions](https://github.com/swarum/tradingview-api-adapter/discussions)
- [API reference](docs/api/)
- [Examples](examples/)
