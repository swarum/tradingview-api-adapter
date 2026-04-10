# Streaming guide

Best practices for long-lived quote subscriptions.

## Basic pattern

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const stream = btc.stream(['lp', 'bid', 'ask'] as const)

stream.on('price', ({ price }) => {
  console.log(`BTC: $${price}`)
})

stream.on('error', (err) => {
  console.error('stream error:', err.message)
})

// … later …
stream.close()
await client.disconnect()
```

## Event shapes

Every event handler receives a single **object argument**. This is
intentional — adding new fields to an event is a non-breaking change.

```ts
// ✓ Correct
stream.on('price', ({ price }) => ...)
stream.on('change', ({ value, percent }) => ...)

// ✗ Wrong — not what the library emits
stream.on('price', (price) => ...)
```

## Choosing fields

`stream(fields?)` accepts a subset of the library's known fields.
Passing fewer fields means less bandwidth and less CPU on both
sides. If you only care about the last price, request only `lp`:

```ts
const stream = btc.stream(['lp'] as const)
```

The `as const` is important — it lets TypeScript infer a narrow
`readonly ['lp']` type for the argument, which propagates to the
return type of any `snapshot()` you call later on the same symbol.

## Cleaning up

A `Stream` holds a reference to its subscription. If you forget to
`close()` it, the underlying quote session stays active and the Node
process won't exit cleanly.

Three safe patterns:

### Explicit close

```ts
const stream = btc.stream()
try {
  // … use stream …
} finally {
  stream.close()
}
```

### `using` declaration (Node 20+, TS 5.2+)

```ts
{
  using stream = btc.stream()
  // … use stream …
} // stream.close() is called automatically when scope exits
```

### Async iteration with break

```ts
for await (const { data } of btc.stream()) {
  console.log(data.lp)
  if (stopCondition) break // ← closes the stream automatically
}
```

## Memory and backpressure

Streams emit events synchronously, in the order they arrive from
TradingView. If your handler is slow, events pile up in Node's
internal queue until it catches up. This is usually fine for
<100 ms handlers. For heavier work:

```ts
const queue: unknown[] = []
const stream = btc.stream()

stream.on('update', (event) => {
  queue.push(event)
  if (queue.length > 1000) {
    queue.shift() // drop oldest — simple cap
  }
})

// Separate worker consumes the queue at its own pace
```

The library does **not** apply backpressure automatically — it
trusts the consumer to handle their own throughput. If you have
strict real-time constraints, consider debouncing or throttling in
your handler.

## Reconnect behaviour

When the WebSocket drops, `Stream` does **not** fire any events for
the duration of the outage. Once the transport reconnects (see
[reconnect guide](reconnect.md)), the underlying quote session is
replayed automatically and updates resume — the consumer's `.on(...)`
handlers keep receiving events as if nothing happened.

Watch for the `close` event on the client to know when the transport
lost the connection:

```ts
client.on('close', () => console.log('disconnected — reconnecting'))
client.on('open', () => console.log('back online'))
```

## Multiple streams on the same symbol

Multiple streams on the same pair share the underlying subscription.
There's no cost to opening several — each just adds its own event
listeners to the same `TvSymbol`.

```ts
const btc = client.symbol('BINANCE:BTCUSDT')
const fast = btc.stream(['lp'] as const)
const full = btc.stream(['lp', 'bid', 'ask', 'volume'] as const)

// Both streams receive events. Closing one doesn't affect the other.
```

The symbol's subscription is the **union** of all fields requested
by any active stream. Closing every stream releases the subscription
back to the quote pool.

## Multi-symbol streams

For more than one pair, prefer `portfolio.stream()` or
`group.stream()` over manually juggling per-symbol streams. They
return a `MultiStream` whose events include the `symbol` field.

```ts
const portfolio = client.symbols(['BTC', 'ETH', 'SOL'])

portfolio.stream(['lp'] as const).on('price', ({ symbol, price }) => {
  console.log(`${symbol}: ${price}`)
})
```

See [`Stream` reference](../api/stream.md) for the full event map.
