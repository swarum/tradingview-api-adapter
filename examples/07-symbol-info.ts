/**
 * 07 — Symbol metadata (SymbolInfo).
 *
 * `.info()` returns a camelCase `SymbolInfo` with description,
 * exchange, currency, session hours, and dozens of other fields
 * TradingView exposes via `symbol_resolved`.
 *
 * Run:
 *   npx tsx examples/07-symbol-info.ts
 */

import { tv } from '../src/index.js'

const client = tv()
const btc = client.symbol('BINANCE:BTCUSDT')

const info = await btc.info()

// SymbolInfo fields are all optional because TradingView emits
// different subsets for different instrument types (crypto, stocks,
// forex, futures, …). We print only the fields that are present.
console.log('── BTCUSDT symbol info ──')
const view: Record<string, unknown> = {
  description: info.description,
  symbolFullname: info.symbolFullname,
  type: info.type,
  exchange: info.exchange,
  listedExchange: info.listedExchange,
  providerId: info.providerId,
  currencyCode: info.currencyCode,
  baseCurrency: info.baseCurrency,
  timezone: info.timezone,
  isTradable: info.isTradable,
  hasIntraday: info.hasIntraday,
  hasDwm: info.hasDwm,
  sessionRegular: info.sessionRegular,
}
for (const [key, value] of Object.entries(view)) {
  if (value !== undefined) {
    console.log(`  ${key.padEnd(18)} ${value}`)
  }
}

console.log(`\nTotal fields in payload: ${Object.keys(info).length}`)

await client.disconnect()
