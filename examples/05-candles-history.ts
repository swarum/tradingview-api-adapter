/**
 * 05 — Historical candles.
 *
 * Fetches the last N OHLCV bars for a symbol at a given timeframe.
 * Timeframes accept both TradingView-native strings (`'60'`, `'1D'`)
 * and human aliases (`'1h'`, `'1d'`).
 *
 * Run:
 *   npx tsx examples/05-candles-history.ts
 */

import { tv } from '../src/index.js'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

console.log('── Last 24 hourly bars for BTCUSDT ──')
const hourly = await btc.candles({ timeframe: '1h', count: 24 })

for (const bar of hourly) {
  const time = new Date(bar.time * 1000).toISOString().slice(0, 16).replace('T', ' ')
  console.log(
    `  ${time}  O=${bar.open.toFixed(2)}  H=${bar.high.toFixed(2)}  L=${bar.low.toFixed(2)}  C=${bar.close.toFixed(2)}  V=${bar.volume.toFixed(2)}`,
  )
}

console.log('\n── Last 10 daily bars ──')
const daily = await btc.candles({ timeframe: '1D', count: 10 })
for (const bar of daily) {
  const date = new Date(bar.time * 1000).toISOString().slice(0, 10)
  const change = bar.close - bar.open
  const sign = change >= 0 ? '+' : ''
  console.log(`  ${date}  close=${bar.close.toFixed(2)}  change=${sign}${change.toFixed(2)}`)
}

await client.disconnect()
