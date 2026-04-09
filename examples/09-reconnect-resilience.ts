/**
 * 09 — Reconnect resilience.
 *
 * The library automatically reconnects on unexpected WebSocket drops
 * using exponential backoff + jitter. This example registers the
 * three lifecycle events so you can observe the reconnect in action.
 *
 * To test it:
 *   1. Run this example.
 *   2. Temporarily disable your network (Wi-Fi off, airplane mode).
 *   3. Re-enable network. The stream should recover and new prices
 *      appear without any code intervention.
 *
 * Run:
 *   npx tsx examples/09-reconnect-resilience.ts
 */

import { tv } from '../src/index.js'

const client = tv({
  reconnect: {
    maxAttempts: 10,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
  },
})

client.on('open', () => console.log('[client] connected'))
client.on('close', () => console.log('[client] closed'))
client.on('reconnect', ({ attempt, delayMs }) =>
  console.log(`[client] reconnect attempt ${attempt}, waiting ${delayMs}ms…`),
)

const btc = client.symbol('BINANCE:BTCUSDT')
const stream = btc.stream(['lp'] as const)

stream.on('price', ({ price }) => {
  console.log(`BTC: $${price}`)
})

console.log('Running for 60 seconds. Drop the network to test reconnect.')
await new Promise((r) => setTimeout(r, 60_000))

stream.close()
await client.disconnect()
