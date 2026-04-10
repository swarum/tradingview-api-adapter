# `TvSymbol`

The user-facing handle for a single market pair. Obtained via
`client.symbol(pair)` — never constructed directly.

```ts
import { type TvSymbol } from 'tradingview-api-adapter'

const btc: TvSymbol = client.symbol('BINANCE:BTCUSDT')
```

## One-shot methods

### `price(): Promise<number>`

Resolve with the last traded price (`lp`). Throws `TvError` if no
price is available (e.g. the symbol is closed and has never traded).

If a stream is already active on this symbol, returns the cached
price synchronously from the accumulated snapshot.

```ts
const price = await btc.price() // → 72183.99
```

### `snapshot<F>(fields: F): Promise<QuoteSnapshot<F>>`
### `snapshot(): Promise<FullQuoteSnapshot>`

Fetch a typed subset of fields, or every field currently accumulated
for the symbol.

```ts
// Typed subset — TypeScript knows exactly which fields are present
const snap = await btc.snapshot(['lp', 'bid', 'ask'] as const)
snap.lp // number | null | undefined
snap.bid // number | null | undefined

// Everything accumulated so far
const full = await btc.snapshot()
```

All values are `| undefined` because TradingView delivers deltas —
any given field may not yet have arrived on the first call.

### `info(): Promise<SymbolInfo>`

Fetch full symbol metadata by issuing a one-shot `resolve_symbol` on
a dedicated chart session.

```ts
const info = await btc.info()
info.description // 'Bitcoin / TetherUS'
info.exchange // 'Binance'
info.type // 'spot'
info.currencyCode // 'USDT'
info.isTradable // true
```

See the [`SymbolInfo` type reference](types.md#symbolinfo) for every
available field.

### `candles(options: CandlesOptions): Promise<Candle[]>`

Fetch historical OHLCV bars at a given timeframe.

```ts
const bars = await btc.candles({ timeframe: '1h', count: 100 })
// → Candle[] with { time, open, high, low, close, volume }
```

`timeframe` accepts both TradingView-native strings (`'60'`, `'1D'`)
and human aliases (`'1h'`, `'1d'`). See
[Candles guide](../guides/candles.md) for the full list.

## Streaming

### `stream(fields?: readonly QuoteField[]): Stream`

Open a live quote subscription. Returns a `Stream` object — see the
[`Stream` reference](stream.md) for events, async iteration, and
cleanup.

```ts
const stream = btc.stream(['lp', 'bid', 'ask'] as const)

stream.on('price', ({ price }) => console.log(price))
stream.on('error', (err) => console.error(err))

// Clean up
stream.close()
```

Multiple streams on the same symbol share the underlying session —
they don't create duplicate subscriptions.

## Properties

### `pair: string`

The market pair this symbol was created for (e.g. `'BINANCE:BTCUSDT'`).

### `subscribedFields: readonly QuoteField[]`

The union of every field requested by any active stream or snapshot
on this symbol.

### `client: Client`

The parent `Client`. Useful if you need to hop back to another
symbol or disconnect.

## Example

```ts
const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

// Fetch multiple things in parallel
const [price, info, candles] = await Promise.all([
  btc.price(),
  btc.info(),
  btc.candles({ timeframe: '1D', count: 30 }),
])

console.log(`${info.description}: $${price}`)
console.log(`Last 30 days of daily bars: ${candles.length}`)

await client.disconnect()
```
