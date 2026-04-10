import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChartSession } from '../../src/sessions/chart-session.js'
import { SessionManager } from '../../src/core/session-manager.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { TvSymbolError, TvTimeoutError } from '../../src/core/errors.js'
import type { CandlesUpdate, CandleTick } from '../../src/sessions/session.types.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('ChartSession', () => {
  let server: MockServer
  let manager: SessionManager | null = null

  beforeEach(async () => {
    server = await startMockServer()
  })

  afterEach(async () => {
    if (manager) {
      await manager.disconnect()
      manager = null
    }
    await server.close()
  })

  async function connect(): Promise<{ m: SessionManager; received: string[] }> {
    const received: string[] = []
    server.onClientMessage((_c, raw) => received.push(raw))
    manager = new SessionManager({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
    })
    server.onConnection((client) => client.send(encodeFrame(HELLO)))
    await manager.connect()
    return { m: manager, received }
  }

  function findCommand(received: string[], method: string): unknown[] | null {
    for (const raw of received) {
      const body = raw.replace(/^~m~\d+~m~/, '')
      try {
        const parsed = JSON.parse(body)
        if (parsed?.m === method) return parsed.p as unknown[]
      } catch {
        /* skip */
      }
    }
    return null
  }

  it('sends chart_create_session on construction', async () => {
    const { m, received } = await connect()
    const cs = new ChartSession({ manager: m })

    await waitFor(() => received.some((r) => r.includes('chart_create_session')))
    const params = findCommand(received, 'chart_create_session')
    expect(params?.[0]).toBe(cs.id)
    expect(cs.id).toMatch(/^cs_/)
  })

  it('sends resolve_symbol and create_series on requestSeries', async () => {
    const { m, received } = await connect()
    const cs = new ChartSession({ manager: m })
    const seriesId = cs.requestSeries({
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '60',
      barCount: 100,
    })

    await waitFor(() => received.some((r) => r.includes('create_series')))
    const resolveParams = findCommand(received, 'resolve_symbol')
    const createParams = findCommand(received, 'create_series')

    expect(resolveParams?.[0]).toBe(cs.id)
    expect(resolveParams?.[2]).toContain('BINANCE:BTCUSDT')

    expect(createParams?.[0]).toBe(cs.id)
    expect(createParams?.[1]).toBe(seriesId)
    expect(createParams?.[4]).toBe('60')
    expect(createParams?.[5]).toBe(100)
  })

  it('parses timescale_update into candles', async () => {
    const { m } = await connect()
    const updates: CandlesUpdate[] = []
    const cs = new ChartSession({
      manager: m,
      onCandles: (u) => updates.push(u),
    })

    const seriesId = cs.requestSeries({
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '1D',
      barCount: 3,
    })

    // Simulate the server backfill.
    const bars = [
      { i: 0, v: [1700000000, 37000, 37500, 36800, 37200, 1000] },
      { i: 1, v: [1700086400, 37200, 37800, 37100, 37600, 1200] },
      { i: 2, v: [1700172800, 37600, 38200, 37500, 38000, 1500] },
    ]
    const payload = { [seriesId]: { s: bars } }
    server.broadcast(encodeFrame(JSON.stringify({ m: 'timescale_update', p: [cs.id, payload] })))

    await waitFor(() => updates.length === 1)
    expect(updates[0]!.symbol).toBe('BINANCE:BTCUSDT')
    expect(updates[0]!.candles).toHaveLength(3)
    expect(updates[0]!.candles[0]).toEqual({
      time: 1700000000,
      open: 37000,
      high: 37500,
      low: 36800,
      close: 37200,
      volume: 1000,
    })
  })

  it('emits live ticks on single-bar du updates after initial load', async () => {
    const { m } = await connect()
    const initials: CandlesUpdate[] = []
    const ticks: CandleTick[] = []
    const cs = new ChartSession({
      manager: m,
      onCandles: (u) => initials.push(u),
      onTick: (t) => ticks.push(t),
    })

    const seriesId = cs.requestSeries({
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '60',
      barCount: 2,
    })

    const backfill = {
      [seriesId]: {
        s: [
          { i: 0, v: [1, 100, 110, 90, 105, 50] },
          { i: 1, v: [2, 105, 115, 100, 112, 60] },
        ],
      },
    }
    server.broadcast(encodeFrame(JSON.stringify({ m: 'timescale_update', p: [cs.id, backfill] })))
    await waitFor(() => initials.length === 1)

    const tick = { [seriesId]: { s: [{ i: 2, v: [3, 112, 120, 111, 118, 20] }] } }
    server.broadcast(encodeFrame(JSON.stringify({ m: 'du', p: [cs.id, tick] })))
    await waitFor(() => ticks.length === 1)

    expect(ticks[0]!.symbol).toBe('BINANCE:BTCUSDT')
    expect(ticks[0]!.candle).toEqual({
      time: 3,
      open: 112,
      high: 120,
      low: 111,
      close: 118,
      volume: 20,
    })
  })

  it('emits TvSymbolError on symbol_error', async () => {
    const { m } = await connect()
    const errors: TvSymbolError[] = []
    const cs = new ChartSession({
      manager: m,
      onError: (e) => errors.push(e),
    })

    cs.requestSeries({ symbol: 'NOTREAL:FAKE', timeframe: '60', barCount: 10 })

    // Find the sym_N used in resolve_symbol. Simpler: just broadcast with sym_1 (predictable seq).
    server.broadcast(
      encodeFrame(
        JSON.stringify({
          m: 'symbol_error',
          p: [cs.id, 'sym_1', 'invalid_symbol'],
        }),
      ),
    )

    await waitFor(() => errors.length === 1)
    expect(errors[0]).toBeInstanceOf(TvSymbolError)
    expect(errors[0]!.symbol).toBe('NOTREAL:FAKE')
  })

  it('delete() sends chart_delete_session and unregisters', async () => {
    const { m, received } = await connect()
    const cs = new ChartSession({ manager: m })
    await cs.delete()

    await waitFor(() => received.some((r) => r.includes('chart_delete_session')))
    expect(m.getSessionCount()).toBe(0)
  })

  it('tolerates malformed candle entries', async () => {
    const { m } = await connect()
    const updates: CandlesUpdate[] = []
    const cs = new ChartSession({ manager: m, onCandles: (u) => updates.push(u) })

    const seriesId = cs.requestSeries({
      symbol: 'X:Y',
      timeframe: '60',
      barCount: 5,
    })

    const payload = {
      [seriesId]: {
        s: [
          { i: 0, v: [1, 100, 110, 90, 105, 50] }, // valid
          { i: 1, v: [2, 'bad', 115, 100, 112, 60] }, // bad open → skipped
          { i: 2, v: [3, 112, 120, 111, 118] }, // too few → skipped
          { i: 3, v: [4, 115, 125, 114, 120, 30] }, // valid
        ],
      },
    }
    server.broadcast(encodeFrame(JSON.stringify({ m: 'timescale_update', p: [cs.id, payload] })))

    await waitFor(() => updates.length === 1)
    expect(updates[0]!.candles).toHaveLength(2)
    expect(updates[0]!.candles.map((c) => c.time)).toEqual([1, 4])
  })

  describe('resolvePair (promise helper)', () => {
    it('resolves with raw symbol_resolved payload', async () => {
      const { m } = await connect()
      const cs = new ChartSession({ manager: m })

      // Simulate server reply asynchronously after resolvePair fires.
      queueMicrotask(() => {
        server.broadcast(
          encodeFrame(
            JSON.stringify({
              m: 'symbol_resolved',
              p: [cs.id, 'sym_1', { symbol: 'BTCUSDT', description: 'Bitcoin', type: 'crypto' }],
            }),
          ),
        )
      })

      const info = await cs.resolvePair('BINANCE:BTCUSDT', 2000)
      expect(info.symbol).toBe('BTCUSDT')
      expect(info.description).toBe('Bitcoin')
    })

    it('rejects on symbol_error', async () => {
      const { m } = await connect()
      const cs = new ChartSession({ manager: m })

      queueMicrotask(() => {
        server.broadcast(
          encodeFrame(
            JSON.stringify({
              m: 'symbol_error',
              p: [cs.id, 'sym_1', 'invalid_symbol'],
            }),
          ),
        )
      })

      await expect(cs.resolvePair('BAD:SYM', 2000)).rejects.toBeInstanceOf(TvSymbolError)
    })

    it('rejects with TvTimeoutError on timeout', async () => {
      const { m } = await connect()
      const cs = new ChartSession({ manager: m })

      await expect(cs.resolvePair('X:Y', 50)).rejects.toBeInstanceOf(TvTimeoutError)
    })
  })

  describe('fetchCandlesOnce (promise helper)', () => {
    it('resolves with candles and removes the series', async () => {
      const { m, received } = await connect()
      const cs = new ChartSession({ manager: m })

      const bars = [
        { i: 0, v: [1000, 100, 110, 90, 105, 50] },
        { i: 1, v: [2000, 105, 115, 100, 112, 60] },
        { i: 2, v: [3000, 112, 118, 109, 114, 45] },
      ]

      queueMicrotask(() => {
        const payload = { sds_1: { s: bars } }
        server.broadcast(
          encodeFrame(JSON.stringify({ m: 'timescale_update', p: [cs.id, payload] })),
        )
      })

      const candles = await cs.fetchCandlesOnce(
        'BINANCE:BTCUSDT',
        { timeframe: '1h', barCount: 3 },
        3000,
      )

      expect(candles).toHaveLength(3)
      expect(candles[0]).toEqual({
        time: 1000,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 50,
      })

      // Series should have been removed after delivery.
      await waitFor(() => received.some((r) => r.includes('remove_series')))
    })

    it('rejects on TvTimeoutError when no data arrives', async () => {
      const { m } = await connect()
      const cs = new ChartSession({ manager: m })

      await expect(
        cs.fetchCandlesOnce('X:Y', { timeframe: '60', barCount: 3 }, 80),
      ).rejects.toBeInstanceOf(TvTimeoutError)
    })
  })
})
