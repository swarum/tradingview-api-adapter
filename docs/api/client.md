# `Client`

The root object of the public API. Owns one WebSocket connection,
pools `TvSymbol` instances, and manages `Portfolio` / `Group`
subscriptions.

Construct via the `tv(options?)` factory.

```ts
import { tv, type Client, type ClientOptions } from 'tradingview-api-adapter'
```

## `tv(options?): Client`

Factory function. Equivalent to `new Client(options)` but reads more
naturally and keeps the import surface small.

## `ClientOptions`

```ts
interface ClientOptions {
  url?: string
  origin?: string
  agent?: unknown
  auth?: AuthOptions
  locale?: [language: string, country: string]
  reconnect?: ReconnectOptions
  rateLimit?: RateLimitOptions
  signal?: AbortSignal
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `wss://widgetdata.tradingview.com/socket.io/websocket` | WebSocket endpoint. Override for local testing or corporate proxies. |
| `origin` | `string` | `https://s.tradingview.com` | Origin header (Node only). |
| `agent` | `unknown` | — | HTTP/SOCKS agent for proxies (Node only). Any `http.Agent`-compatible object. |
| `auth` | `AuthOptions` | `{}` | Credentials — see [Auth guide](../guides/auth.md). |
| `locale` | `[string, string]` | `['en', 'US']` | Locale sent via `set_locale`. |
| `reconnect` | `ReconnectOptions` | `{ maxAttempts: 10, initialDelayMs: 100, maxDelayMs: 30_000, factor: 2, jitter: 0.3 }` | Reconnect tuning. Set `enabled: false` to disable. |
| `rateLimit` | `RateLimitOptions` | `{ batchWindowMs: 50, chunkSize: 50, chunkIntervalMs: 100 }` | Symbol add/remove rate limiting. |
| `signal` | `AbortSignal` | — | Tie client lifetime to an `AbortController`. |

## Methods

### `symbol(pair: string): TvSymbol`

Get the `TvSymbol` handle for a market pair. Pooled — subsequent
calls return the same instance.

```ts
const btc = client.symbol('BINANCE:BTCUSDT')
```

### `symbols(pairs: readonly string[]): Portfolio`

Create an ad-hoc `Portfolio` over the given pairs.

```ts
const p = client.symbols(['BINANCE:BTCUSDT', 'NASDAQ:AAPL'])
```

### `createGroup(name: string, pairs?: readonly string[]): Group`

Create a named, mutable `Group`. Registered in `client.groups`.

```ts
const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT'])
```

### `stream(fields?: readonly QuoteField[]): MultiStream`

Aggregate stream across every `TvSymbol` currently cached on the
client. Automatically dedups — if the same pair belongs to two
groups, you still receive one event per tick.

```ts
client.stream().on('price', ({ symbol, price }) => {
  console.log(`${symbol}: ${price}`)
})
```

### `connect(): Promise<void>`

Open the underlying transport and wait until the TradingView hello
packet arrives. Called automatically by the first operation that
needs the network, so explicit `connect()` is usually unnecessary.

### `disconnect(): Promise<void>`

Close everything: all streams, all groups, the quote pool session,
and the transport. Idempotent.

### `[Symbol.asyncDispose](): Promise<void>`

Async disposer support for `using` declarations.

```ts
using client = tv()
// auto-disconnects on scope exit
```

## Properties

### `manager: SessionManager`

The underlying `SessionManager`. Exposed for advanced use cases that
need direct access to sessions or transport state. Most users can
ignore this.

### `groups: GroupRegistry`

The `Map`-like registry of named groups. See the [`Group`](group.md)
reference.

```ts
client.groups.has('crypto') // boolean
client.groups.get('crypto') // Group | undefined
client.groups.list // readonly string[]
client.groups.size // number

for (const group of client.groups) {
  console.log(group.name, group.size)
}
```

## Events

```ts
client.on('open', () => console.log('connected'))
client.on('close', () => console.log('disconnected'))
client.on('reconnect', ({ attempt, delayMs }) => console.log(attempt, delayMs))
client.on('error', (err) => console.error(err))
```

Remove a listener with `client.off(event, handler)`.

## Example

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv({
  reconnect: { maxAttempts: 5, initialDelayMs: 500 },
})

client.on('reconnect', ({ attempt }) => {
  console.log(`reconnect attempt ${attempt}`)
})

const btc = client.symbol('BINANCE:BTCUSDT')
console.log(await btc.price())

await client.disconnect()
```
