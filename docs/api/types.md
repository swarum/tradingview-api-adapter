# Types

All the domain types you'll encounter as a consumer of
`tradingview-api-adapter`.

```ts
import type {
  QuoteField,
  QuoteSnapshot,
  QuoteFieldTypeMap,
  FullQuoteSnapshot,
  TradeTick,
  BarTick,
  Candle,
  Timeframe,
  SymbolInfo,
} from 'tradingview-api-adapter'
```

## Quote fields

### `QuoteField`

Union of every valid quote field name. The library currently recognises
50+ fields covering price, change, OHLCV, precision, supply,
historical extremes, fundamentals, identity, and booleans.

```ts
type QuoteField =
  | 'lp' | 'bid' | 'ask' | 'ch' | 'chp' | 'volume'
  | 'open_price' | 'high_price' | 'low_price' | 'prev_close_price'
  | 'description' | 'short_name' | 'pro_name' | 'original_name'
  | 'exchange' | 'type' | 'currency_code' | 'country_code'
  | 'trade' | 'minute-bar' | 'daily-bar' | 'prev-daily-bar'
  | 'is_tradable' | 'fractional'
  // … ~50 fields total
```

See [`QuoteFieldTypeMap`](#quotefieldtypemap) for the exact type
attached to each field.

### `QuoteFieldTypeMap`

The canonical mapping from field name to runtime type. Adding a new
field here automatically surfaces it in `QuoteField`, `QuoteSnapshot`,
and `FullQuoteSnapshot`.

Common fields:

| Field | Type |
|---|---|
| `lp` | `number \| null` |
| `bid` | `number \| null` |
| `ask` | `number \| null` |
| `ch` | `number \| null` |
| `chp` | `number \| null` |
| `volume` | `number \| null` |
| `description` | `string` |
| `exchange` | `string` |
| `type` | `string` |
| `is_tradable` | `boolean` |
| `trade` | `TradeTick` |
| `'minute-bar'` | `BarTick` |
| `'daily-bar'` | `BarTick` |

All numeric fields are `number | null` because TradingView sends
`null` for values it doesn't have (closed markets, pre-market
quotes, delisted symbols).

### `QuoteSnapshot<F>`

Typed Pick over the requested subset of fields.

```ts
type Snap = QuoteSnapshot<['lp', 'bid', 'ask']>
// → {
//     lp?:  number | null
//     bid?: number | null
//     ask?: number | null
//   }
```

All fields are `?:` (optional) because TradingView delivers deltas —
a freshly subscribed symbol may not yet have every field filled in.

### `FullQuoteSnapshot`

`Partial<QuoteFieldTypeMap>`. Returned by `snapshot()` without
arguments and by stream `update` events.

### `TradeTick`

A single trade delivered in the `trade` field.

```ts
interface TradeTick {
  'data-update-time': string
  price: string
  size: string
  time: string
}
```

### `BarTick`

A bar delivered in `minute-bar`, `daily-bar`, or `prev-daily-bar`.

```ts
interface BarTick {
  open: string
  high: string
  low: string
  close: string
  volume: string
  time: string
  'update-time': string
  'data-update-time': string
}
```

## Candles

### `Candle`

Parsed OHLCV bar. All times are UTC epoch seconds.

```ts
interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

### `Timeframe`, `RawTimeframe`, `TimeframeAlias`

```ts
type RawTimeframe =
  | '1' | '3' | '5' | '15' | '30' | '45'
  | '60' | '120' | '180' | '240' | '360' | '480' | '720'
  | '1D' | '3D' | '1W' | '1M' | '3M' | '6M' | '12M'

type TimeframeAlias =
  | '1m' | '3m' | '5m' | '15m' | '30m' | '45m'
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '12h'
  | '1d' | '3d' | '1w'

type Timeframe = RawTimeframe | TimeframeAlias
```

- lowercase `m` = **minute**
- uppercase `M` = **month**

### `normalizeTimeframe(tf)`

Convert any accepted `Timeframe` to the TradingView-native wire
string. Throws `TvError` for unknown values.

```ts
normalizeTimeframe('1h') // → '60'
normalizeTimeframe('1D') // → '1D'
normalizeTimeframe('1M') // → '1M' (month, not minute)
```

## Symbol info

### `SymbolInfo`

CamelCase view of TradingView's `symbol_resolved` payload. All
fields are optional — TradingView emits different subsets for
different instrument types (crypto, stocks, forex, futures, …).

Common fields:

| Field | Type |
|---|---|
| `description` | `string` |
| `type` | `string` |
| `exchange` | `string` |
| `providerId` | `string` |
| `currencyCode` | `string` |
| `baseCurrency` | `string` |
| `timezone` | `string` |
| `isTradable` | `boolean` |
| `hasIntraday` | `boolean` |
| `hasDwm` | `boolean` |
| `sessionRegular` | `string` |
| `marketStatus` | `{ phase?: string; tradingday?: string }` |
| `popularityRank` | `number` |

`SymbolInfo` has an index signature (`[key: string]: unknown`), so
new fields TradingView adds in the future are accessible even
before they're declared in the interface.

### `symbolInfoFromRaw(raw)`

Convert a raw TradingView payload into a typed `SymbolInfo`. Used
internally by `TvSymbol.info()` — exposed for advanced users who
need to parse payloads from custom chart sessions.

## Errors

All errors extend `TvError`, so a single `instanceof TvError` check
catches anything this library throws.

```ts
import {
  TvError,
  TvConnectionError,
  TvProtocolError,
  TvSessionError,
  TvSymbolError,
  TvTimeoutError,
} from 'tradingview-api-adapter'
```

| Class | Thrown when |
|---|---|
| `TvConnectionError` | WebSocket transport fails to connect or drops |
| `TvProtocolError` | Malformed or unparseable frame on the wire |
| `TvSessionError` | Quote or chart session-level failure |
| `TvSymbolError` | TradingView rejects a specific symbol |
| `TvTimeoutError` | An operation exceeds its configured timeout |

`TvSymbolError` carries the symbol name on the `symbol` field:

```ts
try {
  await badSymbol.info()
} catch (err) {
  if (err instanceof TvSymbolError) {
    console.log(`Failed for ${err.symbol}`)
  }
}
```

All errors support standard `Error.cause` for chained diagnostics.
