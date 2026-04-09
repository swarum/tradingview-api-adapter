/**
 * Phase 5 demo — Portfolio + Group + aggregate client.stream() against live TradingView.
 *
 * Demonstrates:
 *   - `client.symbols([...])` — ad-hoc portfolio
 *   - `client.createGroup(name, [...])` — long-lived, mutable group
 *   - `group.add() / group.remove()` — live mutation of an active stream
 *   - `client.stream()` — aggregated stream across every subscribed pair
 *   - Dedup: symbols shared between groups fire once on `client.stream()`
 *
 * Run:
 *   npx tsx examples/phase5-groups.ts
 *
 * Verbose:
 *   DEBUG=tradingview-adapter:* npx tsx examples/phase5-groups.ts
 */

import { tv } from '../src/index.js'

async function main(): Promise<void> {
  const client = tv({ reconnect: { maxAttempts: 5, initialDelayMs: 500, maxDelayMs: 5000 } })
  console.log('[demo] connecting…')
  await client.connect()

  // 1. Ad-hoc portfolio — one-off snapshot
  console.log('\n── Portfolio.prices() ──')
  const portfolio = client.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL'])
  const prices = await portfolio.prices()
  console.log(prices)

  // 2. Named group, with live mutation
  console.log('\n── createGroup("crypto") ──')
  const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
  console.log(`crypto: size=${crypto.size}, pairs=${crypto.pairs.join(', ')}`)

  const cryptoStream = crypto.stream(['lp', 'ch', 'chp'] as const)
  let cryptoTicks = 0
  cryptoStream.on('price', ({ symbol, price }) => {
    cryptoTicks++
    if (cryptoTicks <= 6) console.log(`  [crypto] ${symbol}: ${price}`)
  })

  console.log('Listening for 5s on the crypto group…')
  await new Promise((r) => setTimeout(r, 5000))

  // Live-add a new symbol to the group — it joins the active stream
  console.log('\n── crypto.add("BINANCE:DOGEUSDT") ──')
  crypto.add('BINANCE:DOGEUSDT')
  console.log(`crypto: size=${crypto.size}, pairs=${crypto.pairs.join(', ')}`)
  console.log('Listening for 5s more (DOGE should now appear)…')
  await new Promise((r) => setTimeout(r, 5000))

  cryptoStream.close()

  // 3. Second group that shares one symbol with crypto (BTC) —
  //    verify that client.stream() emits BTC updates ONCE, not twice.
  //    We don't keep a reference: the side effect is the group's
  //    presence in client.groups, which is enough for dedup.
  console.log('\n── createGroup("watchlist") sharing BTC with crypto ──')
  client.createGroup('watchlist', ['BINANCE:BTCUSDT', 'NASDAQ:AAPL'])

  const aggregate = client.stream(['lp'] as const)
  const btcHits = new Map<string, number>()
  aggregate.on('update', ({ symbol }) => {
    btcHits.set(symbol, (btcHits.get(symbol) ?? 0) + 1)
  })

  console.log('Listening for 6s on client.stream()…')
  await new Promise((r) => setTimeout(r, 6000))
  aggregate.close()

  console.log('\n── client.stream() update counts (should be deduped) ──')
  for (const [sym, count] of btcHits) {
    console.log(`  ${sym}: ${count} updates`)
  }

  // 4. Group registry inspection
  console.log('\n── client.groups ──')
  console.log(`size=${client.groups.size}, list=${client.groups.list.join(', ')}`)
  for (const g of client.groups) {
    console.log(`  ${g.name}: ${g.pairs.length} pairs`)
  }

  // 5. Clean up
  console.log('\n── disconnect ──')
  await client.disconnect()
  console.log('[demo] done')
}

main().catch((err) => {
  console.error('[demo] fatal:', err)
  process.exit(1)
})
