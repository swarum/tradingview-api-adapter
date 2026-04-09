import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/api/client.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('Portfolio', () => {
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

  async function setup(): Promise<{
    c: Client
    received: string[]
    getSessionId: () => Promise<string>
  }> {
    const received: string[] = []
    server.onClientMessage((_cli, raw) => received.push(raw))
    server.onConnection((c) => c.send(encodeFrame(HELLO)))
    client = tv({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })
    await client.connect()
    return {
      c: client,
      received,
      getSessionId: async () => {
        await waitFor(() => received.some((r) => r.includes('quote_create_session')), {
          timeout: 500,
        })
        const frame = received.find((r) => r.includes('quote_create_session'))!
        return (JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]
      },
    }
  }

  function pushQuote(
    sessionId: string,
    pair: string,
    v: Record<string, unknown>,
    completed = true,
  ): void {
    server.broadcast(
      encodeFrame(JSON.stringify({ m: 'qsd', p: [sessionId, { n: pair, s: 'ok', v }] })),
    )
    if (completed) {
      server.broadcast(encodeFrame(JSON.stringify({ m: 'quote_completed', p: [sessionId, pair] })))
    }
  }

  it('exposes pairs and size as passed to the factory', async () => {
    const { c } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL'])
    expect(p.pairs).toEqual(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL'])
    expect(p.size).toBe(3)
    expect(p.tvSymbols).toHaveLength(3)
  })

  it('prices() returns a map keyed by pair', async () => {
    const { c, getSessionId } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const promise = p.prices()

    const sid = await getSessionId()
    pushQuote(sid, 'BINANCE:BTCUSDT', { lp: 72000 })
    pushQuote(sid, 'BINANCE:ETHUSDT', { lp: 3800 })

    const prices = await promise
    expect(prices).toEqual({
      'BINANCE:BTCUSDT': 72000,
      'BINANCE:ETHUSDT': 3800,
    })
  })

  it('prices() omits symbols that fail', async () => {
    const { c, getSessionId } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const promise = p.prices()

    const sid = await getSessionId()
    pushQuote(sid, 'BINANCE:BTCUSDT', { lp: 72000 })
    pushQuote(sid, 'BINANCE:ETHUSDT', { bid: 3799 }) // no lp → fails

    const prices = await promise
    expect(prices).toEqual({ 'BINANCE:BTCUSDT': 72000 })
  })

  it('snapshot() returns per-symbol typed snapshots', async () => {
    const { c, getSessionId } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const promise = p.snapshot(['lp', 'bid'] as const)

    const sid = await getSessionId()
    pushQuote(sid, 'BINANCE:BTCUSDT', { lp: 72000, bid: 71999, ask: 72001 })
    pushQuote(sid, 'BINANCE:ETHUSDT', { lp: 3800, bid: 3799, ask: 3801 })

    const snap = await promise
    expect(snap['BINANCE:BTCUSDT']).toEqual({ lp: 72000, bid: 71999 })
    expect(snap['BINANCE:ETHUSDT']).toEqual({ lp: 3800, bid: 3799 })
  })

  it('stream() emits per-symbol update events', async () => {
    const { c, getSessionId } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const stream = p.stream(['lp'] as const)

    const updates: Array<{ symbol: string; data: Record<string, unknown> }> = []
    stream.on('update', (e) => updates.push(e))

    const sid = await getSessionId()
    server.broadcast(
      encodeFrame(
        JSON.stringify({
          m: 'qsd',
          p: [sid, { n: 'BINANCE:BTCUSDT', s: 'ok', v: { lp: 100 } }],
        }),
      ),
    )
    server.broadcast(
      encodeFrame(
        JSON.stringify({
          m: 'qsd',
          p: [sid, { n: 'BINANCE:ETHUSDT', s: 'ok', v: { lp: 200 } }],
        }),
      ),
    )

    await waitFor(() => updates.length === 2)

    const symbols = updates.map((u) => u.symbol)
    expect(new Set(symbols)).toEqual(new Set(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT']))

    stream.close()
  })

  it('stream() emits per-symbol price events with the symbol attached', async () => {
    const { c, getSessionId } = await setup()
    const p = c.symbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const stream = p.stream(['lp'] as const)

    const prices: Array<{ symbol: string; price: number }> = []
    stream.on('price', (e) => prices.push(e))

    const sid = await getSessionId()
    server.broadcast(
      encodeFrame(
        JSON.stringify({
          m: 'qsd',
          p: [sid, { n: 'BINANCE:BTCUSDT', s: 'ok', v: { lp: 100 } }],
        }),
      ),
    )
    server.broadcast(
      encodeFrame(
        JSON.stringify({
          m: 'qsd',
          p: [sid, { n: 'BINANCE:ETHUSDT', s: 'ok', v: { lp: 200 } }],
        }),
      ),
    )

    await waitFor(() => prices.length === 2)

    const byPair = new Map(prices.map((p) => [p.symbol, p.price]))
    expect(byPair.get('BINANCE:BTCUSDT')).toBe(100)
    expect(byPair.get('BINANCE:ETHUSDT')).toBe(200)

    stream.close()
  })
})
