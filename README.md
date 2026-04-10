# tradingview-api-adapter

📊 Real-time market data from TradingView via WebSocket — typed, composable, and ergonomic.

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

console.log(await btc.price()) // → 72183.99

btc.stream().on('price', ({ price }) => {
  console.log('BTC:', price)
})

await client.disconnect()
```

## Features

- ✅ **Real-time quotes** — typed `lp`, `bid`, `ask`, `ch`, `chp`, `volume`, and 50+ other fields
- ✅ **Historical candles** — OHLCV bars at any TradingView timeframe (1m → 1M)
- ✅ **Symbol metadata** — full `SymbolInfo` (description, exchange, session hours, …) via one `.info()` call
- ✅ **Multi-symbol streams** — `Portfolio` for ad-hoc collections, `Group` for named, mutable ones
- ✅ **Auto-reconnect** — exponential backoff + jitter, automatic session replay
- ✅ **Full TypeScript types** — `QuoteSnapshot<['lp', 'bid']>` gives you `{ lp?: number | null; bid?: number | null }`
- ✅ **Async iterator** — `for await (const tick of stream) { ... }`
- ✅ **Explicit resource management** — `using client = tv()` auto-disconnects
- ✅ **Node + Browser** — dynamic `ws` import so browser bundles don't carry Node-only code
- ✅ **Proxy + auth** — HTTP/SOCKS proxy agent, `sessionid`/`authToken` for premium access
- ✅ **Battle-tested** — 227+ unit tests, integration against a mock WebSocket server, live e2e

## Installation

```bash
npm install tradingview-api-adapter
```

Requires **Node.js ≥ 20**. See [browser guide](docs/guides/browser.md) for client-side usage.

## Quick start

### Get a price

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const price = await btc.price()
console.log(`BTC: $${price}`)

await client.disconnect()
```

### Stream live updates

```ts
const stream = btc.stream(['lp', 'bid', 'ask', 'ch', 'chp'] as const)

stream.on('price', ({ price }) => console.log(price))
stream.on('change', ({ value, percent }) => console.log(`${value} (${percent}%)`))

// Or use async iteration:
for await (const { data } of stream) {
  console.log(data.lp, data.bid, data.ask)
  if (someCondition) break // ← automatically closes the stream
}
```

### Fetch historical candles

```ts
const candles = await btc.candles({ timeframe: '1h', count: 100 })
// → Candle[] with { time, open, high, low, close, volume }
```

### Multi-symbol portfolio

```ts
const portfolio = client.symbols([
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'NASDAQ:AAPL',
])

const prices = await portfolio.prices()
// → { 'BINANCE:BTCUSDT': 72183, 'BINANCE:ETHUSDT': 2200, 'NASDAQ:AAPL': 260 }

portfolio.stream().on('price', ({ symbol, price }) => {
  console.log(`${symbol}: $${price}`)
})
```

### Named groups with live mutation

```ts
const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])

const stream = crypto.stream()
stream.on('price', ({ symbol, price }) => console.log(symbol, price))

// Add a pair — active streams pick it up automatically
crypto.add('BINANCE:SOLUSDT')

// Remove a pair — active streams stop emitting for it
crypto.remove('BINANCE:ETHUSDT')

// List all registered groups on the client
console.log(client.groups.list) // → ['crypto']
```

### Symbol metadata

```ts
const info = await btc.info()
console.log(info.description) // → 'Bitcoin / TetherUS'
console.log(info.exchange) // → 'Binance'
console.log(info.currencyCode) // → 'USDT'
console.log(info.isTradable) // → true
```

## Documentation

- **[Getting Started](docs/getting-started.md)** — installation, first requests, cleanup
- **[API Reference](docs/api/)** — `Client`, `TvSymbol`, `Stream`, `Group`, types
- **[Guides](docs/guides/)** — streaming best practices, candles, groups, reconnect, browser, proxy, auth
- **[Migration from 1.x](MIGRATION.md)** — before/after for every 1.x method
- **[Contributing](CONTRIBUTING.md)** — development workflow, conventions, `.js` extension rationale
- **[Changelog](CHANGELOG.md)**

## Examples

The [`examples/`](examples/) directory contains 12 runnable demos:

| # | File | What it shows |
|---|---|---|
| 01 | `01-single-price.ts` | Minimal one-shot price fetch |
| 02 | `02-streaming.ts` | Single-symbol stream with `price`, `change` events |
| 03 | `03-multi-symbol.ts` | Ad-hoc `Portfolio` |
| 04 | `04-groups.ts` | Named `Group` with live `add`/`remove` |
| 05 | `05-candles-history.ts` | Historical OHLCV bars |
| 06 | `06-candles-streaming.ts` | Live bar ticks (via internal `ChartSession`) |
| 07 | `07-symbol-info.ts` | Full symbol metadata |
| 08 | `08-async-iterator.ts` | `for await` over a stream |
| 09 | `09-reconnect-resilience.ts` | Automatic reconnect with backoff |
| 10 | `10-browser.html` | Vanilla HTML page via esm.sh CDN |
| 11 | `11-proxy-node.ts` | HTTP/SOCKS proxy through an agent |
| 12 | `12-auth-session.ts` | Authenticated access with TradingView cookies |

Run any of them with `npx tsx examples/NN-*.ts`. Enable verbose logging via
`DEBUG=tradingview-adapter:* npx tsx examples/NN-*.ts`.

## Design principles

This library is a full rewrite of 1.x. The redesign prioritised:

1. **Typed over stringly-typed.** `QuoteSnapshot<['lp', 'bid']>` is `{ lp?: number | null; bid?: number | null }`, not `Record<string, any>`.
2. **Composable over monolithic.** `Transport` ↔ `Protocol` ↔ `SessionManager` ↔ public API are independently testable and swappable.
3. **One socket, many sessions.** A single WebSocket connection multiplexes every quote and chart subscription through a shared `SessionManager`.
4. **Pooled symbols.** `client.symbol('BTC')` always returns the same instance, so overlapping groups dedupe automatically.
5. **No hidden state.** Every resource (symbol, stream, group) has an explicit lifecycle.
6. **Browser-safe by construction.** `ws` is loaded through dynamic `import()` so browser bundlers can drop it.

## License

MIT © [Gerasimenko Oleg](https://github.com/swarum)
