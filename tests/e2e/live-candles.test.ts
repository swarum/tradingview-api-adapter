/**
 * E2E: live candle tests against real TradingView.
 *
 * Gated behind `LIVE_E2E=1`.
 *
 * Run manually:
 *   LIVE_E2E=1 npx vitest run tests/e2e
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tv, type Client, type Candle } from '../../src/index.js'

const SKIP = !process.env.LIVE_E2E

describe.skipIf(SKIP)('Live TradingView candles', () => {
  let client: Client

  beforeAll(() => {
    client = tv({
      reconnect: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 3000 },
    })
  })

  afterAll(async () => {
    await client.disconnect()
  })

  it('fetches 10 hourly BTC candles', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const candles = await btc.candles({ timeframe: '1h', count: 10 })

    expect(candles.length).toBeGreaterThanOrEqual(5) // TV may return slightly fewer
    for (const bar of candles) {
      assertValidCandle(bar)
    }

    // Bars should be in chronological order.
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i]!.time).toBeGreaterThan(candles[i - 1]!.time)
    }
  }, 20_000)

  it('fetches daily candles with human alias timeframe', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const candles = await btc.candles({ timeframe: '1d', count: 30 })

    expect(candles.length).toBeGreaterThanOrEqual(10)
    for (const bar of candles) {
      assertValidCandle(bar)
    }
  }, 20_000)

  it('fetches AAPL daily candles', async () => {
    const aapl = client.symbol('NASDAQ:AAPL')
    const candles = await aapl.candles({ timeframe: '1D', count: 10 })

    expect(candles.length).toBeGreaterThanOrEqual(3)
    for (const bar of candles) {
      assertValidCandle(bar)
      // AAPL prices should be in reasonable stock range
      expect(bar.close).toBeGreaterThan(1)
      expect(bar.close).toBeLessThan(10_000)
    }
  }, 20_000)

  it('fetches candles for different timeframes in parallel', async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')

    const [hourly, daily] = await Promise.all([
      btc.candles({ timeframe: '1h', count: 5 }),
      btc.candles({ timeframe: '1D', count: 5 }),
    ])

    expect(hourly.length).toBeGreaterThanOrEqual(3)
    expect(daily.length).toBeGreaterThanOrEqual(3)

    // Daily bars should have wider time gaps than hourly.
    if (daily.length >= 2 && hourly.length >= 2) {
      const dailyGap = daily[1]!.time - daily[0]!.time
      const hourlyGap = hourly[1]!.time - hourly[0]!.time
      expect(dailyGap).toBeGreaterThan(hourlyGap)
    }
  }, 25_000)
})

function assertValidCandle(bar: Candle): void {
  expect(typeof bar.time).toBe('number')
  expect(bar.time).toBeGreaterThan(0)

  expect(typeof bar.open).toBe('number')
  expect(typeof bar.high).toBe('number')
  expect(typeof bar.low).toBe('number')
  expect(typeof bar.close).toBe('number')
  expect(typeof bar.volume).toBe('number')

  // OHLC sanity: high >= low, high >= open, high >= close
  expect(bar.high).toBeGreaterThanOrEqual(bar.low)
  expect(bar.high).toBeGreaterThanOrEqual(bar.open)
  expect(bar.high).toBeGreaterThanOrEqual(bar.close)
  expect(bar.low).toBeLessThanOrEqual(bar.open)
  expect(bar.low).toBeLessThanOrEqual(bar.close)

  expect(bar.volume).toBeGreaterThanOrEqual(0)
}
