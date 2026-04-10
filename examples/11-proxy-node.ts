/**
 * 11 — HTTP/SOCKS proxy (Node only).
 *
 * TradingView's WebSocket is sometimes blocked by corporate firewalls.
 * You can tunnel through an HTTP or SOCKS proxy by passing an agent
 * to `tv({ agent })`. Any `http.Agent`-compatible object works —
 * commonly `https-proxy-agent` or `socks-proxy-agent` from npm.
 *
 * Prerequisite:
 *   npm install https-proxy-agent
 *
 * Run (replace the proxy URL with your own):
 *   PROXY=http://proxy.example.com:3128 npx tsx examples/11-proxy-node.ts
 *
 * This file is commented out on purpose — uncomment and edit the
 * `agent` line after installing the proxy package.
 */

import { tv } from '../src/index.js'
// import { HttpsProxyAgent } from 'https-proxy-agent'

async function main(): Promise<void> {
  const proxyUrl = process.env.PROXY
  if (!proxyUrl) {
    console.log('Set the PROXY env var to a proxy URL, e.g. http://proxy.example.com:3128')
    console.log('Also: npm install https-proxy-agent and uncomment the import above.')
    return
  }

  const client = tv({
    // agent: new HttpsProxyAgent(proxyUrl),
  })

  const price = await client.symbol('BINANCE:BTCUSDT').price()
  console.log(`BTCUSDT via proxy: $${price}`)

  await client.disconnect()
}

main().catch((err) => {
  console.error('Proxy demo failed:', err)
  process.exit(1)
})
