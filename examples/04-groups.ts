/**
 * 04 — Named groups with live mutation.
 *
 * `Group` is a long-lived, mutable collection registered with the
 * `Client`. It supports `add`/`remove`/`has` and automatically keeps
 * active streams in sync with the group's current membership.
 *
 * Run:
 *   npx tsx examples/04-groups.ts
 */

import { tv } from '../src/index.js'

const client = tv()

// Create a named group and open a stream over it.
const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
const stream = crypto.stream(['lp'] as const)

stream.on('price', ({ symbol, price }) => {
  console.log(`[${symbol}] $${price}`)
})

console.log(`Group "crypto" size=${crypto.size}, pairs=${crypto.pairs.join(', ')}`)
console.log('Streaming for 5 seconds…')
await new Promise((r) => setTimeout(r, 5_000))

// Live-add a new pair to the group. The active stream picks it up
// automatically — no need to recreate anything.
console.log('\nAdding DOGEUSDT to the group…')
crypto.add('BINANCE:DOGEUSDT')
console.log(`Group size now: ${crypto.size}`)

await new Promise((r) => setTimeout(r, 5_000))

// Remove one. Active stream stops receiving updates for it.
console.log('\nRemoving ETHUSDT from the group…')
crypto.remove('BINANCE:ETHUSDT')
console.log(`Group size now: ${crypto.size}`)

await new Promise((r) => setTimeout(r, 5_000))

// List registered groups on the client.
console.log('\nClient groups:', client.groups.list)

stream.close()
await crypto.delete()
await client.disconnect()
