/**
 * 01 — Single price.
 *
 * The shortest useful program with tradingview-api-adapter: fetch the
 * last traded price for one symbol and print it.
 *
 * Run:
 *   npx tsx examples/01-single-price.ts
 */

import { tv } from '../src/index.js'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const price = await btc.price()
console.log(`BTCUSDT: $${price}`)

await client.disconnect()
