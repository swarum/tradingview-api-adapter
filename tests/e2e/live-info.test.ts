/**
 * E2E: live symbol info tests against real TradingView.
 *
 * Gated behind `LIVE_E2E=1`.
 *
 * Run manually:
 *   LIVE_E2E=1 npx vitest run tests/e2e
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/index.js'

const SKIP = !process.env.LIVE_E2E

describe.skipIf(SKIP)('Live TradingView symbol info', () => {
  let client: Client

  beforeAll(() => {
    client = tv({
      reconnect: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 3000 },
    })
  })

  afterAll(async () => {
    await client.disconnect()
  })

  it('fetches BTC symbol info with expected fields', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const info = await btc.info()

    expect(info.description).toBeDefined()
    expect(typeof info.description).toBe('string')
    expect(info.description!.length).toBeGreaterThan(0)

    expect(info.exchange).toBeDefined()
    expect(info.type).toBeDefined()
    expect(info.timezone).toBeDefined()

    // Should have a reasonable number of fields.
    const fieldCount = Object.keys(info).length
    expect(fieldCount).toBeGreaterThan(20)
  }, 15_000)

  it('fetches AAPL symbol info', async () => {
    const aapl = client.symbol('NASDAQ:AAPL')
    const info = await aapl.info()

    expect(info.description).toBeDefined()
    expect(info.exchange).toBeDefined()
    expect(info.currencyCode).toBe('USD')
  }, 15_000)

  it('fetches info for multiple symbols in parallel', async () => {
    const [btcInfo, ethInfo] = await Promise.all([
      client.symbol('BINANCE:BTCUSDT').info(),
      client.symbol('BINANCE:ETHUSDT').info(),
    ])

    expect(btcInfo.description).toBeDefined()
    expect(ethInfo.description).toBeDefined()
    expect(btcInfo.description).not.toBe(ethInfo.description)
  }, 20_000)
})
