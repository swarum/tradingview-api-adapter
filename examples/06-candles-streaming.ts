/**
 * 06 — Live candle tick updates.
 *
 * The public `TvSymbol.candles()` method is a one-shot history fetch.
 * For live bar updates (the "last bar is currently forming" stream),
 * drop to the internal `ChartSession` API.
 *
 * This example uses the advanced/internal surface exported from
 * `tradingview-api-adapter/internal`. That module is semver-exempt —
 * it may change in minor releases.
 *
 * Run:
 *   npx tsx examples/06-candles-streaming.ts
 */

import { tv } from '../src/index.js'
import { ChartSession } from '../src/internal.js'

const client = tv()
await client.connect()

const chart = new ChartSession({
  manager: client.manager,
  onCandles: ({ symbol, candles }) => {
    console.log(`[${symbol}] initial backfill: ${candles.length} bars`)
    const last = candles[candles.length - 1]
    if (last) {
      console.log(`  last bar: time=${last.time} close=${last.close}`)
    }
  },
  onTick: ({ symbol, candle }) => {
    console.log(
      `[${symbol}] tick  time=${candle.time}  close=${candle.close}  volume=${candle.volume.toFixed(4)}`,
    )
  },
  onError: (err) => console.error('chart error:', err.message),
})

chart.requestSeries({
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '1',
  barCount: 3,
})

console.log('Streaming live 1-minute candle updates for BTCUSDT (10s)…')
await new Promise((r) => setTimeout(r, 10_000))

await chart.delete()
await client.disconnect()
