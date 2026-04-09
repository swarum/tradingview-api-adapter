/**
 * 12 — Authentication (Node only).
 *
 * The library ships with anonymous defaults (`"unauthorized_user_token"`)
 * that cover 90% of use cases: public quotes, candles, symbol info.
 *
 * For premium features (real-time US stocks, invite-only indicators,
 * exchange-licensed data), pass TradingView session credentials:
 *
 *   1. Log in to tradingview.com in your browser.
 *   2. Open devtools → Application → Cookies → tradingview.com.
 *   3. Copy the values of `sessionid` and `sessionid_sign`.
 *   4. Either paste them below, or read them from environment variables.
 *
 * Obtaining a real `authToken` (the JWT-like token used in
 * `set_auth_token`) requires an HTTP request against tradingview.com
 * that this library does not make. If you have your own auth flow,
 * pass the resulting token in `auth.authToken`.
 *
 * Run:
 *   TV_SESSIONID=... TV_SESSIONID_SIGN=... npx tsx examples/12-auth-session.ts
 */

import { tv } from '../src/index.js'

const sessionid = process.env.TV_SESSIONID
const sessionidSign = process.env.TV_SESSIONID_SIGN

if (!sessionid) {
  console.log('Running in anonymous mode. Set TV_SESSIONID to authenticate.')
}

const client = tv({
  auth: {
    sessionid,
    sessionidSign,
    // authToken: process.env.TV_AUTH_TOKEN,
  },
  locale: ['en', 'US'],
})

// Anonymous access still works — the auth option is additive.
const btc = client.symbol('BINANCE:BTCUSDT')
const price = await btc.price()
console.log(`BTCUSDT: $${price} (auth: ${sessionid ? 'yes' : 'no'})`)

// If you are authenticated, NYSE/NASDAQ quotes should come back
// real-time instead of 15-minute delayed.
try {
  const aapl = client.symbol('NASDAQ:AAPL')
  const aaplPrice = await aapl.price()
  console.log(`AAPL:    $${aaplPrice}`)
} catch (err) {
  console.log(`AAPL fetch failed:`, (err as Error).message)
}

await client.disconnect()
