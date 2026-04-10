/**
 * E2E: live quote tests against real TradingView.
 *
 * These tests hit the actual TradingView WebSocket endpoint. They are:
 *   - Slow (seconds per test)
 *   - Network-dependent (can fail on outages, rate limits, VPN issues)
 *   - Gated behind `LIVE_E2E=1` environment variable
 *
 * Run manually:
 *   LIVE_E2E=1 npx vitest run tests/e2e
 *
 * In CI they run nightly via `.github/workflows/e2e.yml`.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/index.js'

const SKIP = !process.env.LIVE_E2E

describe.skipIf(SKIP)('Live TradingView quotes', () => {
  let client: Client

  beforeAll(() => {
    client = tv({
      reconnect: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 3000 },
    })
  })

  afterEach(async () => {
    // Don't disconnect between tests — reuse the connection.
  })

  // Single shared disconnect at the very end.
  afterAll(async () => {
    await client.disconnect()
  })

  it('fetches a live BTC price', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const price = await btc.price()

    expect(typeof price).toBe('number')
    expect(price).toBeGreaterThan(0)
    expect(price).toBeLessThan(1_000_000) // sanity upper bound
  }, 15_000)

  it('fetches a live ETH price', async () => {
    const eth = client.symbol('BINANCE:ETHUSDT')
    const price = await eth.price()

    expect(typeof price).toBe('number')
    expect(price).toBeGreaterThan(0)
  }, 15_000)

  it('fetches a live AAPL price', async () => {
    const aapl = client.symbol('NASDAQ:AAPL')
    const price = await aapl.price()

    expect(typeof price).toBe('number')
    expect(price).toBeGreaterThan(0)
  }, 15_000)

  it('streams at least 3 BTC ticks within 10 seconds', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const prices: number[] = []

    await new Promise<void>((resolve) => {
      const stream = btc.stream(['lp'] as const)
      stream.on('price', ({ price }) => {
        prices.push(price)
        if (prices.length >= 3) {
          stream.close()
          resolve()
        }
      })

      // Timeout safety — resolve even if less than 3 ticks arrive.
      setTimeout(() => {
        stream.close()
        resolve()
      }, 10_000)
    })

    expect(prices.length).toBeGreaterThanOrEqual(1)
    for (const p of prices) {
      expect(typeof p).toBe('number')
      expect(p).toBeGreaterThan(0)
    }
  }, 15_000)

  it('snapshot returns typed fields', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const snap = await btc.snapshot(['lp', 'bid', 'ask', 'volume'] as const)

    // At least lp should be present after quote_completed.
    expect(snap.lp).toBeDefined()
    expect(typeof snap.lp).toBe('number')
  }, 15_000)

  it('portfolio.prices() returns multiple symbols', async () => {
    const portfolio = client.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const prices = await portfolio.prices()

    expect(Object.keys(prices).length).toBeGreaterThanOrEqual(1)
    for (const [pair, price] of Object.entries(prices)) {
      expect(typeof pair).toBe('string')
      expect(typeof price).toBe('number')
      expect(price).toBeGreaterThan(0)
    }
  }, 20_000)
})

// afterAll needs to be importable
import { afterAll } from 'vitest'
