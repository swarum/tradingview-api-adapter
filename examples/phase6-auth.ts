/**
 * Phase 6 demo — auth + locale against live TradingView.
 *
 * Demonstrates:
 *   - `tv({ auth: { ... }, locale: [...] })` configuration
 *   - Public (anonymous) access works by default
 *   - `set_auth_token` + `set_locale` prologue visible in debug logs
 *
 * Most users never need to touch the auth options — public quotes and
 * candles work without any credentials (which is what this demo
 * actually uses). If you have your own TradingView account, you can
 * set `auth.sessionid` + `auth.sessionidSign` to unlock premium
 * streams. Obtaining a real `authToken` requires an HTTP call to
 * tradingview.com that this library does not perform on your behalf.
 *
 * Run:
 *   npx tsx examples/phase6-auth.ts
 *
 * To see the set_auth_token and set_locale prologue messages, enable
 * verbose logging:
 *
 *   DEBUG=tradingview-adapter:transport npx tsx examples/phase6-auth.ts
 */

import { tv } from '../src/index.js'

async function main(): Promise<void> {
  // Public / anonymous connection. The library sends
  //   set_auth_token ["unauthorized_user_token"]
  //   set_locale     ["en", "US"]
  // automatically right after the TradingView hello packet arrives.
  const client = tv({
    locale: ['en', 'US'],
    reconnect: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 3000 },
  })

  console.log('[demo] connecting (anonymous)…')
  await client.connect()
  console.log('[demo] ready')

  const btc = client.symbol('BINANCE:BTCUSDT')
  const price = await btc.price()
  console.log(`BTCUSDT last price: $${price}`)

  const info = await btc.info()
  console.log(`BTCUSDT description: ${info.description}`)

  // Advanced usage (commented out — requires real credentials):
  //
  // const authed = tv({
  //   auth: {
  //     sessionid: process.env.TV_SESSIONID!,
  //     sessionidSign: process.env.TV_SESSIONID_SIGN!,
  //     authToken: process.env.TV_AUTH_TOKEN, // optional, JWT-like
  //   },
  //   locale: ['en', 'US'],
  // })
  //
  // Proxy example (Node only, requires an agent):
  //
  // import { HttpsProxyAgent } from 'https-proxy-agent'
  // const proxied = tv({
  //   agent: new HttpsProxyAgent('http://proxy.example.com:3128'),
  // })

  await client.disconnect()
  console.log('[demo] done')
}

main().catch((err) => {
  console.error('[demo] fatal:', err)
  process.exit(1)
})
