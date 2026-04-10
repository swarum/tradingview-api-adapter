# `Stream` and `MultiStream`

Live quote subscriptions returned by `tvSymbol.stream()`,
`portfolio.stream()`, `group.stream()`, and `client.stream()`.

There are two closely related classes:

- **`Stream`** — single-symbol, returned by `TvSymbol.stream()`
- **`MultiStream`** — multi-symbol, returned by `Portfolio`, `Group`, and `Client.stream()`

The APIs are almost identical; the only difference is that
`MultiStream` events carry a `symbol` field.

## `Stream` (single symbol)

```ts
import { type Stream } from 'tradingview-api-adapter'

const stream: Stream = btc.stream(['lp', 'bid', 'ask'] as const)
```

### Events

```ts
interface StreamEventMap {
  update: { symbol: string; data: FullQuoteSnapshot }
  price: { price: number }
  change: { value: number; percent: number }
  bar: { bar: TradeTick | BarTick }
  error: Error
}
```

| Event | Fires when | Payload |
|---|---|---|
| `update` | Any field changes | `{ symbol, data }` — `data` is a shallow copy of the accumulated snapshot |
| `price` | `lp` (last price) updates | `{ price }` |
| `change` | `ch` or `chp` updates and both are present | `{ value, percent }` |
| `bar` | A new `trade`, `minute-bar`, or `daily-bar` arrives | `{ bar }` |
| `error` | TradingView reports a per-symbol error | `Error` |

### `on(event, handler): this`

Register a listener.

```ts
stream
  .on('price', ({ price }) => console.log(price))
  .on('change', ({ value, percent }) => console.log(value, percent))
```

### `off(event, handler): this`

Remove a listener.

### `close(): void`

Close the stream and release its subscription. Subsequent events
will not fire.

```ts
stream.close()
```

### `[Symbol.dispose](): void`

Synchronous disposer for `using` declarations.

```ts
using stream = btc.stream()
// auto-closes on scope exit
```

### `[Symbol.asyncIterator](): AsyncIterator<{ symbol, data }>`

Iterate over `update` events with `for await`. Breaking out of the
loop closes the stream automatically.

```ts
for await (const { data } of btc.stream()) {
  console.log(data.lp)
  if (data.lp > 73000) break // ← closes the stream
}
```

## `MultiStream`

Same API as `Stream`, but events include the `symbol` field and
there's no `price`/`change`/`bar` event without it.

### Events

```ts
interface MultiStreamEventMap {
  update: { symbol: string; data: FullQuoteSnapshot }
  price: { symbol: string; price: number }
  change: { symbol: string; value: number; percent: number }
  bar: { symbol: string; bar: TradeTick | BarTick }
  error: Error
}
```

Everything else — `on`/`off`/`close`/`Symbol.dispose`/`asyncIterator` —
works the same way.

```ts
const portfolio = client.symbols(['BTC', 'ETH', 'SOL'])
const stream = portfolio.stream(['lp'] as const)

stream.on('price', ({ symbol, price }) => {
  console.log(`${symbol}: ${price}`)
})
```

### Properties

- `pairs` — readonly list of pairs currently attached
- `size` — number of attached symbols
- `isClosed` — whether the stream has been closed

## Patterns

### Cleanup on process exit

```ts
const stream = btc.stream()

process.on('SIGINT', async () => {
  stream.close()
  await client.disconnect()
  process.exit(0)
})
```

### Explicit resource management (Node 20+)

```ts
{
  using stream = btc.stream(['lp'] as const)
  stream.on('price', ({ price }) => console.log(price))

  await new Promise((r) => setTimeout(r, 10_000))
} // ← stream.close() called automatically here
```

### Graceful error handling

```ts
const stream = btc.stream()

stream.on('error', (err) => {
  if (err.message.includes('invalid symbol')) {
    stream.close()
  } else {
    console.error('transient error:', err)
  }
})
```

See [Streaming guide](../guides/streaming.md) for more detailed
patterns around backpressure, reconnect behaviour, and memory
management.
