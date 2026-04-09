import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client, tv } from '../../src/api/client.js'
import { TvSymbol } from '../../src/api/symbol.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { TvError } from '../../src/core/errors.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('Client', () => {
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

  describe('factory + lifecycle', () => {
    it('tv() returns a Client instance', () => {
      const c = tv({ reconnect: { enabled: false }, url: server.url })
      expect(c).toBeInstanceOf(Client)
      void c.disconnect()
    })

    it('connect() reaches the manager ready state', async () => {
      const c = buildClient()
      await c.connect()
      expect(c.manager.getState()).toBe('ready')
    })

    it('emits "open" event on successful connect', async () => {
      const c = buildClient()
      let opened = 0
      c.on('open', () => opened++)
      await c.connect()
      expect(opened).toBe(1)
    })

    it('emits "close" event on disconnect', async () => {
      const c = buildClient()
      let closed = 0
      c.on('close', () => closed++)
      await c.connect()
      await c.disconnect()
      client = null // prevent double-disconnect in afterEach
      expect(closed).toBe(1)
    })

    it('disconnect() is idempotent', async () => {
      const c = buildClient()
      await c.connect()
      await c.disconnect()
      await c.disconnect()
      client = null
    })

    it('throws when using the client after disconnect', async () => {
      const c = buildClient()
      await c.connect()
      await c.disconnect()
      client = null
      expect(() => c.symbol('X')).toThrow(TvError)
    })
  })

  describe('symbol pool', () => {
    it('returns the same TvSymbol instance for repeated calls', async () => {
      const c = buildClient()
      await c.connect()
      const a = c.symbol('BINANCE:BTCUSDT')
      const b = c.symbol('BINANCE:BTCUSDT')
      expect(a).toBe(b)
      expect(a).toBeInstanceOf(TvSymbol)
    })

    it('returns different instances for different pairs', async () => {
      const c = buildClient()
      await c.connect()
      const btc = c.symbol('BINANCE:BTCUSDT')
      const eth = c.symbol('BINANCE:ETHUSDT')
      expect(btc).not.toBe(eth)
      expect(c._getSymbolCache().size).toBe(2)
    })
  })

  describe('quote pool', () => {
    it('lazily creates a shared QuoteSession on first use', async () => {
      const c = buildClient()
      await c.connect()
      expect(c.manager.getSessionCount()).toBe(0)

      // Touching _getQuotePool instantiates the pool → registers on manager.
      c._getQuotePool()
      expect(c.manager.getSessionCount()).toBe(1)
    })

    it('_requestFields aggregates uniquely across symbols', async () => {
      const c = buildClient()
      await c.connect()
      c._requestFields(['lp', 'bid'])
      c._requestFields(['lp', 'ask']) // 'lp' deduped, 'ask' added

      const received: string[] = []
      server.onClientMessage((_cli, raw) => received.push(raw))

      // Force a pool create AFTER aggregation so setFields is called
      c._getQuotePool()
      await waitFor(() => received.some((r) => r.includes('quote_set_fields')), {
        timeout: 200,
      })

      const frame = received.find((r) => r.includes('quote_set_fields'))!
      const body = JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: unknown[] }
      const fields = body.p.slice(1)
      expect(new Set(fields)).toEqual(new Set(['lp', 'bid', 'ask']))
    })
  })

  describe('asyncDispose', () => {
    it('disconnects when Symbol.asyncDispose is invoked', async () => {
      const c = buildClient()
      await c.connect()
      let closed = 0
      c.on('close', () => closed++)
      await c[Symbol.asyncDispose]()
      client = null
      expect(closed).toBe(1)
    })
  })
})
