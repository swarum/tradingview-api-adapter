# Getting started

This guide walks you through installing `tradingview-api-adapter`,
making your first request, streaming live updates, and cleaning up.

## Install

```bash
npm install tradingview-api-adapter
```

Requirements:

- **Node.js ≥ 20** (uses `using` / `Symbol.asyncDispose`)
- Works in browsers via bundlers (Vite, webpack, esbuild, Rollup) and CDNs (esm.sh, jsdelivr)

## Your first program

Create `hello-tv.ts`:

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const price = await btc.price()
console.log(`BTCUSDT: $${price}`)

await client.disconnect()
```

Run it:

```bash
npx tsx hello-tv.ts
```

You should see something like:

```
BTCUSDT: $72183.99
```

That's it — no API keys, no registration, no configuration. Public
market data from hundreds of exchanges is available immediately.

## Concepts

### Client

`tv(options?)` creates a `Client` — the root object. A client owns one
WebSocket connection and pools every `TvSymbol`, `Portfolio`, and
`Group` you create through it.

```ts
const client = tv({
  reconnect: { maxAttempts: 10, initialDelayMs: 500 },
  rateLimit: { batchWindowMs: 50, chunkSize: 50 },
})
```

### Symbols

`client.symbol(pair)` returns a `TvSymbol` handle for a specific
market pair. The pair format is `EXCHANGE:TICKER` — for example
`BINANCE:BTCUSDT`, `NASDAQ:AAPL`, `FOREX:EURUSD`.

```ts
const btc = client.symbol('BINANCE:BTCUSDT')

await btc.price() // number
await btc.snapshot(['lp', 'bid', 'ask'] as const) // typed partial
await btc.info() // SymbolInfo
await btc.candles({ timeframe: '1h', count: 100 }) // Candle[]
```

Calling `client.symbol('X')` twice returns the **same instance** —
the library pools symbols internally, so there's no hidden cost to
calling it repeatedly.

### Streams

`tvSymbol.stream(fields?)` opens a live subscription and returns a
typed event emitter:

```ts
const stream = btc.stream(['lp', 'bid', 'ask', 'ch', 'chp'] as const)

stream.on('price', ({ price }) => console.log(price))
stream.on('change', ({ value, percent }) => console.log(value, percent))
stream.on('update', ({ data }) => console.log(data))
stream.on('error', (err) => console.error(err))

// Clean up when you're done:
stream.close()
```

Streams support `for await`:

```ts
for await (const tick of btc.stream()) {
  console.log(tick.data.lp)
  if (tick.data.lp > 73000) break // ← auto-closes
}
```

### Multiple symbols

For more than one pair at a time, use a `Portfolio` (ad-hoc,
immutable) or a `Group` (named, mutable):

```ts
// Portfolio — one-off
const p = client.symbols(['BTC', 'ETH', 'SOL'])
const prices = await p.prices()

// Group — long-lived and mutable
const crypto = client.createGroup('crypto', ['BTC', 'ETH'])
crypto.add('SOL')
crypto.stream().on('price', ({ symbol, price }) => console.log(symbol, price))
```

### Lifecycle

Every `Client` must be disconnected when you're done. Either call
`disconnect()` explicitly:

```ts
await client.disconnect()
```

…or use the modern `using` declaration (TS 5.2+, Node 20+):

```ts
using client = tv()
// … use client …
// automatic disconnect when the scope exits
```

Forgetting to disconnect leaves the WebSocket open and the Node
process unable to exit cleanly.

## Next steps

- **[API reference](api/)** — full method signatures for `Client`, `TvSymbol`, `Stream`, `Group`, etc.
- **[Streaming guide](guides/streaming.md)** — event types, backpressure, cleanup patterns
- **[Candles guide](guides/candles.md)** — historical data, timeframes, live updates
- **[Groups guide](guides/groups.md)** — when to use `Portfolio` vs `Group`
- **[Reconnect guide](guides/reconnect.md)** — how reconnect works, what to expect
- **[Browser guide](guides/browser.md)** — integrating with Vue/React/Next.js
- **[Auth guide](guides/auth.md)** — premium features, sessionid, authToken
- **[Examples](../examples/)** — 12 runnable demos

## Troubleshooting

### `ERR_MODULE_NOT_FOUND` on import

Make sure your project supports ESM. Either set `"type": "module"` in
`package.json`, or use the `.cjs` variant by importing from
`tradingview-api-adapter` in a CommonJS project (the dual build handles
it automatically).

### `Timeout waiting for ... to load`

The default load timeout is 10 seconds. If TradingView is slow or the
symbol you requested doesn't exist, you'll hit this. Double-check the
pair format (`EXCHANGE:TICKER`, both uppercase).

### WebSocket connection rejected in browser

TradingView checks the `Origin` header. Browsers set it automatically
to the current page's origin, so serving from a domain other than
tradingview.com may be rejected. See [browser guide](guides/browser.md)
for proxy-based workarounds.

### I need premium / real-time US stock data

Public US stock quotes are delayed by 15 minutes by default. Log in
to tradingview.com, copy your `sessionid` cookie, and pass it as
`auth.sessionid` to `tv()`. See [auth guide](guides/auth.md).
