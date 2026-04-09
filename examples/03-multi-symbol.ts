/**
 * 03 — Multiple symbols at once (Portfolio).
 *
 * `client.symbols([...])` creates an ad-hoc Portfolio — an immutable
 * collection of symbols you can query or stream together. Use this
 * for one-off snapshots like "what are the prices of these 5 tickers
 * right now?".
 *
 * Run:
 *   npx tsx examples/03-multi-symbol.ts
 */

import { tv } from '../src/index.js'

const client = tv()

const portfolio = client.symbols([
  'BINANCE:BTCUSDT',
  'BINANCE:ETHUSDT',
  'BINANCE:SOLUSDT',
  'NASDAQ:AAPL',
  'NASDAQ:TSLA',
])

console.log('── Snapshot ──')
const prices = await portfolio.prices()
for (const [pair, price] of Object.entries(prices)) {
  console.log(`  ${pair}: $${price}`)
}

console.log('\n── 5-second stream ──')
const stream = portfolio.stream(['lp'] as const)
stream.on('price', ({ symbol, price }) => {
  console.log(`  tick ${symbol}: $${price}`)
})

await new Promise((r) => setTimeout(r, 5_000))
stream.close()
await client.disconnect()
