import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Client, tv } from '../../src/api/client.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { TvError } from '../../src/core/errors.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('TvSymbol', () => {
  let server: MockServer
  let client: Client | null = null

  beforeEach(async () => {
    server = await startMockServer()
  })

  afterEach(async () => {
    if (client) {
      await client.disconnect()
      client = null
    }
    await server.close()
  })

  function buildClient(): Client {
    client = tv({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })
    server.onConnection((c) => c.send(encodeFrame(HELLO)))
    return client
  }

  /**
   * Push a `qsd` frame that looks like it comes from the pool's quote
   * session. We discover the session id by watching client messages
   * for the matching `quote_create_session`.
   */
  async function primeSymbol(
    received: string[],
    pair: string,
    v: Record<string, unknown>,
  ): Promise<string> {
    await waitFor(() => received.some((r) => r.includes('quote_create_session')), {
      timeout: 500,
    })
    const frame = received.find((r) => r.includes('quote_create_session'))!
    const body = JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: [string] }
    const sessionId = body.p[0]

    server.broadcast(
      encodeFrame(JSON.stringify({ m: 'qsd', p: [sessionId, { n: pair, s: 'ok', v }] })),
    )
    server.broadcast(encodeFrame(JSON.stringify({ m: 'quote_completed', p: [sessionId, pair] })))
    return sessionId
  }

  describe('price()', () => {
    it('resolves with the last price after quote_completed', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const pricePromise = btc.price()

      await primeSymbol(received, 'BINANCE:BTCUSDT', { lp: 72000, bid: 71999, ask: 72001 })
      await expect(pricePromise).resolves.toBe(72000)
    })

    it('fast-paths when lp is already cached', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      void btc.price() // triggers subscribe
      await primeSymbol(received, 'BINANCE:BTCUSDT', { lp: 72000 })

      // Second call should return synchronously from cache.
      const start = Date.now()
      const p = await btc.price()
      expect(p).toBe(72000)
      expect(Date.now() - start).toBeLessThan(10)
    })

    it('throws when no lp is available', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const pricePromise = btc.price()
      await primeSymbol(received, 'BINANCE:BTCUSDT', { bid: 71999 }) // no lp!
      await expect(pricePromise).rejects.toBeInstanceOf(TvError)
    })
  })

  describe('snapshot()', () => {
    it('returns only requested fields', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const snapPromise = btc.snapshot(['lp', 'bid'] as const)

      await primeSymbol(received, 'BINANCE:BTCUSDT', {
        lp: 72000,
        bid: 71999,
        ask: 72001,
        volume: 14_000,
      })

      const snap = await snapPromise
      expect(snap).toEqual({ lp: 72000, bid: 71999 })
      expect('ask' in snap).toBe(false)
    })

    it('returns all accumulated fields without args', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const snapPromise = btc.snapshot()
      await primeSymbol(received, 'BINANCE:BTCUSDT', { lp: 1, bid: 2, ask: 3 })

      const snap = await snapPromise
      expect(snap).toMatchObject({ lp: 1, bid: 2, ask: 3 })
    })

    it('routes updates to the right symbol when multiple are active', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const eth = c.symbol('BINANCE:ETHUSDT')

      const btcPromise = btc.price()
      const ethPromise = eth.price()

      await waitFor(() => received.some((r) => r.includes('quote_create_session')))
      const frame = received.find((r) => r.includes('quote_create_session'))!
      const sessionId = (JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]

      server.broadcast(
        encodeFrame(
          JSON.stringify({
            m: 'qsd',
            p: [sessionId, { n: 'BINANCE:BTCUSDT', s: 'ok', v: { lp: 72000 } }],
          }),
        ),
      )
      server.broadcast(
        encodeFrame(
          JSON.stringify({
            m: 'qsd',
            p: [sessionId, { n: 'BINANCE:ETHUSDT', s: 'ok', v: { lp: 3800 } }],
          }),
        ),
      )
      server.broadcast(
        encodeFrame(JSON.stringify({ m: 'quote_completed', p: [sessionId, 'BINANCE:BTCUSDT'] })),
      )
      server.broadcast(
        encodeFrame(JSON.stringify({ m: 'quote_completed', p: [sessionId, 'BINANCE:ETHUSDT'] })),
      )

      await expect(btcPromise).resolves.toBe(72000)
      await expect(ethPromise).resolves.toBe(3800)
    })
  })

  describe('info()', () => {
    it('resolves via a fresh chart session and returns camelCase SymbolInfo', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const infoPromise = btc.info()

      await waitFor(() => received.some((r) => r.includes('chart_create_session')))
      const csFrame = received.find((r) => r.includes('chart_create_session'))!
      const chartSessionId = (JSON.parse(csFrame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]

      server.broadcast(
        encodeFrame(
          JSON.stringify({
            m: 'symbol_resolved',
            p: [
              chartSessionId,
              'sym_1',
              {
                symbol: 'BTCUSDT',
                description: 'Bitcoin / TetherUS',
                'base-currency': 'BTC',
                is_tradable: true,
                type: 'crypto',
              },
            ],
          }),
        ),
      )

      const info = await infoPromise
      expect(info.symbol).toBe('BTCUSDT')
      expect(info.description).toBe('Bitcoin / TetherUS')
      expect(info.baseCurrency).toBe('BTC')
      expect(info.isTradable).toBe(true)
      expect(info.type).toBe('crypto')
    })
  })

  describe('candles()', () => {
    it('fetches historical candles via a one-shot chart session', async () => {
      const c = buildClient()
      await c.connect()
      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      const btc = c.symbol('BINANCE:BTCUSDT')
      const candlesPromise = btc.candles({ timeframe: '1h', count: 3 })

      await waitFor(() => received.some((r) => r.includes('create_series')))
      const csFrame = received.find((r) => r.includes('chart_create_session'))!
      const chartSessionId = (JSON.parse(csFrame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]

      const payload = {
        sds_1: {
          s: [
            { i: 0, v: [1000, 100, 110, 90, 105, 50] },
            { i: 1, v: [2000, 105, 115, 100, 112, 60] },
            { i: 2, v: [3000, 112, 118, 109, 114, 45] },
          ],
        },
      }
      server.broadcast(
        encodeFrame(JSON.stringify({ m: 'timescale_update', p: [chartSessionId, payload] })),
      )

      const candles = await candlesPromise
      expect(candles).toHaveLength(3)
      expect(candles[0]!.close).toBe(105)
      expect(candles[2]!.close).toBe(114)
    })

    it('rejects when count <= 0', async () => {
      const c = buildClient()
      await c.connect()
      const btc = c.symbol('BINANCE:BTCUSDT')
      await expect(btc.candles({ timeframe: '1h', count: 0 })).rejects.toBeInstanceOf(TvError)
    })
  })
})
