/**
 * 08 — Async iterator over a stream.
 *
 * `Stream` implements `Symbol.asyncIterator`, so you can consume
 * updates with `for await (…)` instead of event listeners. Breaking
 * out of the loop closes the stream automatically.
 *
 * Run:
 *   npx tsx examples/08-async-iterator.ts
 */

import { tv } from '../src/index.js'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const stream = btc.stream(['lp'] as const)

let count = 0
for await (const { symbol, data } of stream) {
  const lp = (data as { lp?: number | null }).lp
  if (typeof lp === 'number') {
    count++
    console.log(`#${count} ${symbol}: $${lp}`)
    if (count >= 10) break // ← automatically closes the stream
  }
}

console.log(`\nReceived ${count} ticks; stream closed by break.`)
await client.disconnect()
