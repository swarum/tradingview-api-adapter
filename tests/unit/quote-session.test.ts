import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuoteSession } from '../../src/sessions/quote-session.js'
import { SessionManager } from '../../src/core/session-manager.js'
import { encodeFrame } from '../../src/core/protocol.js'
import type { QuoteErrorInfo, QuoteUpdate } from '../../src/sessions/session.types.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('QuoteSession', () => {
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

  async function connect(): Promise<{
    m: SessionManager
    received: string[]
  }> {
    const received: string[] = []
    server.onClientMessage((_c, raw) => received.push(raw))
    manager = new SessionManager({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
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

  it('sends quote_create_session on construction', async () => {
    const { m, received } = await connect()
    const qs = new QuoteSession({ manager: m })

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))
    const params = findCommand(received, 'quote_create_session')
    expect(params?.[0]).toBe(qs.id)
    expect(qs.id).toMatch(/^qs_/)
  })

  it('sends quote_set_fields when setFields is called', async () => {
    const { m, received } = await connect()
    const qs = new QuoteSession({ manager: m })
    qs.setFields(['lp', 'bid', 'ask'])

    await waitFor(() => received.some((r) => r.includes('quote_set_fields')))
    const params = findCommand(received, 'quote_set_fields')
    expect(params?.[0]).toBe(qs.id)
    expect(params?.slice(1)).toEqual(['lp', 'bid', 'ask'])
  })

  it('batches symbol additions via SymbolBatcher', async () => {
    const { m, received } = await connect()
    const qs = new QuoteSession({ manager: m })

    qs.addSymbol('BINANCE:BTCUSDT')
    qs.addSymbol('BINANCE:ETHUSDT')
    qs.addSymbol('NASDAQ:AAPL')

    await waitFor(() => received.some((r) => r.includes('quote_add_symbols')), {
      timeout: 200,
    })

    const params = findCommand(received, 'quote_add_symbols')
    expect(params?.[0]).toBe(qs.id)
    const symbols = params?.slice(1) ?? []
    expect(new Set(symbols)).toEqual(new Set(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL']))
  })

  it('accumulates qsd deltas into a per-symbol snapshot', async () => {
    const { m } = await connect()
    const updates: QuoteUpdate[] = []
    const qs = new QuoteSession({
      manager: m,
      onUpdate: (u) => updates.push(u),
    })

    // Simulate incoming qsd frames targeting this session.
    const send = (v: Record<string, unknown>): void => {
      const body = JSON.stringify({
        m: 'qsd',
        p: [qs.id, { n: 'BINANCE:BTCUSDT', s: 'ok', v }],
      })
      server.broadcast(encodeFrame(body))
    }

    send({ lp: 72000, bid: 71999.99, ask: 72000.01 })
    await waitFor(() => updates.length === 1)

    send({ lp: 72050 }) // delta — only lp changed
    await waitFor(() => updates.length === 2)

    expect(updates[0]!.isFirstLoad).toBe(true)
    expect(updates[0]!.delta).toEqual({ lp: 72000, bid: 71999.99, ask: 72000.01 })
    expect(updates[0]!.snapshot).toEqual({ lp: 72000, bid: 71999.99, ask: 72000.01 })

    expect(updates[1]!.delta).toEqual({ lp: 72050 })
    expect(updates[1]!.snapshot).toEqual({ lp: 72050, bid: 71999.99, ask: 72000.01 })
  })

  it('emits per-symbol errors via onError', async () => {
    const { m } = await connect()
    const errors: QuoteErrorInfo[] = []
    const qs = new QuoteSession({
      manager: m,
      onError: (e) => errors.push(e),
    })

    const body = JSON.stringify({
      m: 'qsd',
      p: [qs.id, { n: 'BAD:SYM', s: 'error', v: {}, errmsg: 'invalid symbol' }],
    })
    server.broadcast(encodeFrame(body))

    await waitFor(() => errors.length === 1)
    expect(errors[0]).toEqual({ symbol: 'BAD:SYM', message: 'invalid symbol' })
  })

  it('tracks isFirstLoad per symbol based on quote_completed', async () => {
    const { m } = await connect()
    const updates: QuoteUpdate[] = []
    const completes: string[] = []
    const qs = new QuoteSession({
      manager: m,
      onUpdate: (u) => updates.push(u),
      onComplete: (s) => completes.push(s),
    })

    const qsd = (v: Record<string, unknown>): void => {
      const body = JSON.stringify({
        m: 'qsd',
        p: [qs.id, { n: 'SYM', s: 'ok', v }],
      })
      server.broadcast(encodeFrame(body))
    }
    const completed = (): void => {
      const body = JSON.stringify({ m: 'quote_completed', p: [qs.id, 'SYM'] })
      server.broadcast(encodeFrame(body))
    }

    qsd({ lp: 100 })
    await waitFor(() => updates.length === 1)
    expect(updates[0]!.isFirstLoad).toBe(true)

    completed()
    await waitFor(() => completes.length === 1)

    qsd({ lp: 101 })
    await waitFor(() => updates.length === 2)
    expect(updates[1]!.isFirstLoad).toBe(false)
  })

  it('delete() sends quote_delete_session and unregisters', async () => {
    const { m, received } = await connect()
    const qs = new QuoteSession({ manager: m })
    await qs.delete()

    await waitFor(() => received.some((r) => r.includes('quote_delete_session')))
    expect(m.getSessionCount()).toBe(0)
  })

  it('getSubscribedSymbols returns the local view', async () => {
    const { m } = await connect()
    const qs = new QuoteSession({ manager: m })

    qs.addSymbols(['A', 'B', 'C'])
    qs.removeSymbol('B')

    await qs.flushPending()
    expect(new Set(qs.getSubscribedSymbols())).toEqual(new Set(['A', 'C']))
  })
})
