/**
 * 02 — Streaming a single symbol.
 *
 * Opens a live quote stream on BTCUSDT and prints every price tick
 * for 10 seconds. Demonstrates:
 *   - `.stream()` returns a typed event emitter
 *   - `'price'`, `'change'`, and `'update'` events
 *   - `stream.close()` releases the subscription
 *   - Graceful Ctrl+C via SIGINT
 *
 * Run:
 *   npx tsx examples/02-streaming.ts
 */

import { tv } from '../src/index.js'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const stream = btc.stream(['lp', 'bid', 'ask', 'ch', 'chp'] as const)

stream.on('price', ({ price }) => {
  console.log(`BTC price: $${price}`)
})

stream.on('change', ({ value, percent }) => {
  const sign = value >= 0 ? '+' : ''
  console.log(`  24h change: ${sign}${value.toFixed(2)} (${sign}${percent.toFixed(2)}%)`)
})

stream.on('error', (err) => {
  console.error('stream error:', err.message)
})

console.log('Streaming BTCUSDT for 10 seconds…')
await new Promise((r) => setTimeout(r, 10_000))

stream.close()
await client.disconnect()
console.log('Done.')

process.on('SIGINT', () => {
  stream.close()
  void client.disconnect().then(() => process.exit(0))
})
