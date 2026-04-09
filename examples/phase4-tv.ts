/**
 * Phase 4 demo — the public API against live TradingView.
 *
 * This example uses only `tradingview-api-adapter`'s public surface:
 * `tv()`, `Client`, `TvSymbol`, `Stream`. Everything about transport,
 * protocol, sessions, and rate limiting is hidden behind this API.
 *
 * Run:
 *   npx tsx examples/phase4-tv.ts
 *
 * Verbose logs:
 *   DEBUG=tradingview-adapter:* npx tsx examples/phase4-tv.ts
 */

import { tv } from '../src/index.js'

async function main(): Promise<void> {
  const client = tv({
    reconnect: { maxAttempts: 5, initialDelayMs: 500, maxDelayMs: 5000 },
  })

  client.on('open', () => console.log('[client] open'))
  client.on('close', () => console.log('[client] close'))
  client.on('reconnect', ({ attempt, delayMs }) =>
    console.log(`[client] reconnect attempt=${attempt} delay=${delayMs}ms`),
  )

  console.log('[demo] connecting…')
  await client.connect()
  console.log('[demo] connected')

  const btc = client.symbol('BINANCE:BTCUSDT')

  // 1. One-shot price
  console.log('\n── price() ──')
  const price = await btc.price()
  console.log(`BTCUSDT last price: $${price}`)

  // 2. Typed snapshot
  console.log('\n── snapshot() ──')
  const snap = await btc.snapshot(['lp', 'bid', 'ask', 'ch', 'chp', 'volume'] as const)
  console.log('BTCUSDT snapshot:', snap)

  // 3. Symbol info (camelCase SymbolInfo via chart session resolve)
  console.log('\n── info() ──')
  const info = await btc.info()
  console.log('Description:', info.description)
  console.log('Exchange:   ', info.exchange)
  console.log('Type:       ', info.type)
  console.log('Currency:   ', info.currencyCode)
  console.log('Timezone:   ', info.timezone)
  console.log('Tradable:   ', info.isTradable)

  // 4. Historical candles
  console.log('\n── candles() ──')
  const candles = await btc.candles({ timeframe: '1h', count: 5 })
  console.log(`BTCUSDT: last ${candles.length} hourly bars`)
  for (const c of candles) {
    console.log(
      `  ${new Date(c.time * 1000).toISOString()}  O=${c.open}  H=${c.high}  L=${c.low}  C=${c.close}  V=${c.volume.toFixed(2)}`,
    )
  }

  // 5. Streaming
  console.log('\n── stream() ──')
  const stream = btc.stream(['lp', 'bid', 'ask', 'ch', 'chp'] as const)

  let priceTicks = 0
  stream.on('price', ({ price: p }) => {
    priceTicks++
    if (priceTicks <= 10) console.log(`  price: ${p}`)
  })
  stream.on('change', ({ value, percent }) => {
    if (priceTicks <= 10) console.log(`  change: ${value} (${percent}%)`)
  })
  stream.on('error', (err) => console.error('  stream error:', err.message))

  console.log('Listening for 10 seconds…')
  await new Promise((r) => setTimeout(r, 10_000))
  stream.close()
  console.log(`Stream closed after ${priceTicks} price ticks.`)

  // 6. Multiple symbols
  console.log('\n── multiple symbols ──')
  const eth = client.symbol('BINANCE:ETHUSDT')
  const aapl = client.symbol('NASDAQ:AAPL')
  const [ethPrice, aaplPrice] = await Promise.all([eth.price(), aapl.price()])
  console.log(`ETHUSDT: $${ethPrice}`)
  console.log(`AAPL:    $${aaplPrice}`)

  // 7. Cleanup
  console.log('\n── disconnect ──')
  await client.disconnect()
  console.log('[demo] done')
}

main().catch((err) => {
  console.error('[demo] fatal:', err)
  process.exit(1)
})
