# Candles guide

How to fetch OHLCV data, choose timeframes, and stream live bars.

## Historical candles

```ts
const btc = client.symbol('BINANCE:BTCUSDT')
const bars = await btc.candles({ timeframe: '1h', count: 100 })
// → Candle[] with { time, open, high, low, close, volume }
```

Each `Candle` has:

```ts
interface Candle {
  time: number // UTC epoch seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

## Timeframes

Two notations are accepted:

### TradingView-native

The raw strings TV expects on the wire. Minute-based values are
counts of minutes (`'60'` = 1 hour, `'240'` = 4 hours).

```
'1'   '3'   '5'   '15'  '30'  '45'
'60'  '120' '180' '240' '360' '480' '720'
'1D'  '3D'
'1W'
'1M'  '3M'  '6M'  '12M'
```

### Human aliases

More readable. The library normalises them to the raw form before
sending to TradingView.

```
'1m'  '3m'  '5m'  '15m' '30m' '45m'
'1h'  '2h'  '3h'  '4h'  '6h'  '8h'  '12h'
'1d'  '3d'
'1w'
```

**Case matters:**
- lowercase `m` = minute (`'1m'` → `'1'`)
- uppercase `M` = month (`'1M'` stays `'1M'`)

To avoid confusion, either:
- Use aliases for minutes, hours, days, weeks
- Use raw strings for months (`'1M'`, `'3M'`)

## Count

`count` is the number of bars to fetch on the initial load. There
is no documented upper limit — TradingView's server decides. In
practice counts up to ~5000 work for most symbols.

If you need more history, fetch multiple chunks and stitch them
together on your side.

## Latest bar

To get only the most recent bar, request `count: 1`:

```ts
const [latest] = await btc.candles({ timeframe: '1D', count: 1 })
if (latest) {
  console.log(`Today's close: ${latest.close}`)
}
```

## Live bar updates

`candles()` is a **one-shot** fetch. It does not subscribe to live
updates on the current bar.

For live bar streaming (the "current bar is forming" feed), drop to
the internal `ChartSession` API:

```ts
import { tv } from 'tradingview-api-adapter'
import { ChartSession } from 'tradingview-api-adapter/internal'

const client = tv()
await client.connect()

const chart = new ChartSession({
  manager: client.manager,
  onCandles: ({ symbol, candles }) => {
    // Initial backfill — all the historical bars
    console.log(`${symbol}: ${candles.length} bars loaded`)
  },
  onTick: ({ symbol, candle }) => {
    // Live tick on the current bar
    console.log(`${symbol}: ${candle.close}`)
  },
  onError: (err) => console.error(err),
})

chart.requestSeries({
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '1m',
  barCount: 10,
})

// … later …
await chart.delete()
await client.disconnect()
```

See [`examples/06-candles-streaming.ts`](../../examples/06-candles-streaming.ts)
for a runnable version.

A public `TvSymbol.candleStream()` method may come in a future
minor release.

## Time handling

All `time` values are **UTC epoch seconds**. To display in local
time:

```ts
const date = new Date(candle.time * 1000)
console.log(date.toLocaleString())
```

## Fetching different timeframes in parallel

```ts
const [hourly, daily, weekly] = await Promise.all([
  btc.candles({ timeframe: '1h', count: 168 }), // 1 week of hourly
  btc.candles({ timeframe: '1d', count: 30 }), // 1 month of daily
  btc.candles({ timeframe: '1W', count: 52 }), // 1 year of weekly
])
```

Each call creates a temporary chart session, fetches the data,
and tears down — they don't interfere with each other or with any
active quote streams.
