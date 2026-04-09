# Groups guide

When to use `Portfolio`, when to use `Group`, and how the
aggregate `client.stream()` de-duplicates.

## Portfolio vs Group

| Property | `Portfolio` | `Group` |
|---|---|---|
| Lifecycle | Ad-hoc, short-lived | Long-lived, tracked by `client` |
| Mutation | Immutable after creation | `add` / `remove` / `clear` |
| Named | No | Yes (via `client.createGroup(name, ...)`) |
| Tracked in `client.groups` | No | Yes |
| Use case | One-off queries | Persistent watchlists, dashboards |

### When to use `Portfolio`

```ts
// "Give me prices for these 5 tickers right now"
const prices = await client.symbols([
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'NASDAQ:AAPL',
  'NASDAQ:TSLA',
  'FOREX:EURUSD',
]).prices()
```

Portfolios are created and discarded — don't hold on to them.

### When to use `Group`

```ts
// A user-editable crypto watchlist
const crypto = client.createGroup('crypto', [])
crypto.add('BINANCE:BTCUSDT')
crypto.add('BINANCE:ETHUSDT')
crypto.add('BINANCE:SOLUSDT')

const stream = crypto.stream(['lp'] as const)
stream.on('price', ({ symbol, price }) => updateDashboard(symbol, price))

// Later — user edits the watchlist
crypto.add('BINANCE:DOGEUSDT') // active stream picks it up automatically
crypto.remove('BINANCE:ETHUSDT') // active stream detaches it
```

Groups are created once, mutated over time, and explicitly deleted.

## Live stream mutation

A key feature of `Group` is that `add()` and `remove()` propagate to
every active stream:

```ts
const crypto = client.createGroup('crypto', ['BTC', 'ETH'])
const stream = crypto.stream()

stream.on('price', ({ symbol, price }) => console.log(symbol, price))

// … streaming BTC and ETH …

crypto.add('SOL')
// … stream now also emits events for SOL …

crypto.remove('ETH')
// … stream stops emitting events for ETH …
```

No need to recreate the stream, no lost subscription state, no
race conditions. The library takes care of attaching and detaching
child streams under the hood.

## Aggregate client stream

`client.stream()` creates a `MultiStream` over **every symbol
currently in the client's symbol cache**. This is useful for global
dashboards that need to observe all subscriptions at once without
worrying about which group they belong to.

```ts
const crypto = client.createGroup('crypto', ['BTC', 'ETH'])
const stocks = client.createGroup('stocks', ['AAPL', 'TSLA'])

client.stream().on('price', ({ symbol, price }) => {
  console.log(`${symbol}: ${price}`)
})
// fires for BTC, ETH, AAPL, TSLA
```

## Automatic dedup

When the same pair belongs to multiple groups, `client.stream()`
fires **one event per tick**, not one per group:

```ts
client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
client.createGroup('watchlist', ['BINANCE:BTCUSDT', 'NASDAQ:AAPL'])

client.stream().on('price', ({ symbol, price }) => {
  // BTCUSDT fires ONCE per tick, not twice
})
```

This comes for free from the pooled `TvSymbol` architecture:
`client.symbol(pair)` always returns the same instance, so each
pair has exactly one handle in the symbol cache regardless of how
many groups reference it. `client.stream()` iterates the cache
directly, so duplicates are structurally impossible.

Note that **per-group** streams still fire for their own members:

```ts
const cryptoStream = client.groups.get('crypto')!.stream()
const watchlistStream = client.groups.get('watchlist')!.stream()

cryptoStream.on('price', () => console.log('crypto saw BTC'))
watchlistStream.on('price', () => console.log('watchlist saw BTC'))
// Both fire for the same BTC tick — they're independent multi-streams.
```

This is the expected behaviour: each group stream represents its own
view of the data. Dedup only applies to the client-level aggregate.

## Cleanup

### Delete a group

```ts
await client.groups.delete('crypto')
// Every stream on the group is closed automatically,
// and the group is removed from client.groups.
```

### Delete every group (on shutdown)

```ts
await client.disconnect()
// Automatically disposes every group and closes every stream.
```

## Iterating registered groups

`client.groups` is a `Map`-like collection. Iterate it with
`for..of`:

```ts
for (const group of client.groups) {
  console.log(`${group.name}: ${group.size} pairs`)
  for (const pair of group.pairs) {
    console.log(`  ${pair}`)
  }
}
```

Or get just the list of names:

```ts
console.log(client.groups.list) // → ['crypto', 'stocks']
console.log(client.groups.size) // → 2
console.log(client.groups.has('crypto')) // → true
```
