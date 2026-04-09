# `Portfolio`, `Group`, and `GroupRegistry`

Multi-symbol collections for querying and streaming several pairs
at once.

- **`Portfolio`** — ad-hoc, immutable, short-lived. Created via `client.symbols([...])`.
- **`Group`** — named, mutable, long-lived. Created via `client.createGroup(...)`. Tracked in `client.groups`.

Both share the same query methods (`prices()`, `snapshot()`, `stream()`).
The difference is lifecycle: `Portfolio` fixes its pairs at creation,
`Group` lets you `add` / `remove` over time with automatic stream
sync.

## `Portfolio`

```ts
const p = client.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL'])
```

### Properties

- `pairs` — readonly list of pairs
- `tvSymbols` — readonly list of underlying `TvSymbol` handles
- `size` — number of pairs

### Methods

#### `prices(): Promise<Record<string, number>>`

Last prices keyed by pair. Pairs that fail to return a price are
omitted from the result.

```ts
const prices = await p.prices()
// → { 'BINANCE:BTCUSDT': 72183, 'BINANCE:ETHUSDT': 2200, 'NASDAQ:AAPL': 260 }
```

#### `snapshot<F>(fields: F): Promise<Record<string, QuoteSnapshot<F>>>`
#### `snapshot(): Promise<Record<string, FullQuoteSnapshot>>`

Typed snapshots keyed by pair.

```ts
const snap = await p.snapshot(['lp', 'bid', 'ask'] as const)
snap['BINANCE:BTCUSDT'].lp // number | null | undefined
```

#### `stream(fields?: readonly QuoteField[]): MultiStream`

Open a multi-symbol stream over every pair in the portfolio. See
[`Stream` reference](stream.md#multistream).

```ts
p.stream(['lp'] as const).on('price', ({ symbol, price }) => {
  console.log(symbol, price)
})
```

## `Group`

```ts
const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
```

### Properties

- `name` — the group's name
- `pairs` — readonly list of pairs
- `tvSymbols` — readonly list of `TvSymbol` handles
- `size` — number of pairs

### Mutation

#### `add(pair: string): this`

Add a pair. Idempotent — adding an existing pair is a no-op. Active
streams on this group automatically pick up the new pair.

```ts
crypto.add('BINANCE:SOLUSDT')
```

#### `addAll(pairs: Iterable<string>): this`

Add many pairs at once.

#### `remove(pair: string): boolean`

Remove a pair. Returns `true` if it was present. Active streams
automatically stop emitting events for the removed pair.

```ts
crypto.remove('BINANCE:ETHUSDT') // → true
crypto.remove('BINANCE:ETHUSDT') // → false (already gone)
```

#### `removeAll(pairs: Iterable<string>): number`

Remove many pairs. Returns the count of pairs that were actually
removed.

#### `has(pair: string): boolean`

Check membership.

#### `clear(): this`

Remove every pair from the group.

### One-shot queries

`prices()`, `snapshot()`, and `stream()` work identically to
`Portfolio`.

### Lifecycle

#### `delete(): Promise<void>`

Close every active stream on this group and remove it from the
parent client's `groups` registry. Safe to call more than once.

```ts
await crypto.delete()
```

## `GroupRegistry`

Accessible as `client.groups`. A `Map`-like collection that tracks
every named group on the client.

### Methods

```ts
client.groups.create(name, pairs) // → Group (throws on duplicate)
client.groups.get(name) // → Group | undefined
client.groups.has(name) // → boolean
client.groups.delete(name) // → Promise<boolean>
```

### Properties

```ts
client.groups.list // → readonly string[]  (group names)
client.groups.size // → number
```

### Iteration

`GroupRegistry` is iterable — use `for..of` to enumerate every
registered group.

```ts
for (const group of client.groups) {
  console.log(group.name, group.size)
}
```

## Dedup and aggregate streaming

When the same pair belongs to multiple groups, `client.stream()`
automatically de-duplicates. A single tick on `BTCUSDT` fires the
aggregate listener **once**, regardless of how many groups reference
the pair.

```ts
client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
client.createGroup('watchlist', ['BINANCE:BTCUSDT', 'NASDAQ:AAPL'])

client.stream().on('price', ({ symbol, price }) => {
  // BTCUSDT updates once per tick, not twice.
})
```

This dedup is free — it comes from the fact that `client.symbol(pair)`
returns a pooled instance, so each pair has exactly one `TvSymbol`
regardless of how many groups reference it.

See [Groups guide](../guides/groups.md) for patterns around when to
use `Portfolio` vs `Group`.
