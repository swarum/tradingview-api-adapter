import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/api/client.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { TvError } from '../../src/core/errors.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('Group', () => {
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

  function pushUpdate(sessionId: string, pair: string, v: Record<string, unknown>): void {
    server.broadcast(
      encodeFrame(JSON.stringify({ m: 'qsd', p: [sessionId, { n: pair, s: 'ok', v }] })),
    )
  }

  describe('construction and mutation', () => {
    it('is created via client.createGroup and registered in client.groups', async () => {
      const { c } = await setup()
      const crypto = c.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
      expect(crypto.name).toBe('crypto')
      expect(crypto.size).toBe(2)
      expect(crypto.pairs).toEqual(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
      expect(c.groups.has('crypto')).toBe(true)
      expect(c.groups.get('crypto')).toBe(crypto)
    })

    it('throws on duplicate names', async () => {
      const { c } = await setup()
      c.createGroup('dup', [])
      expect(() => c.createGroup('dup', [])).toThrow(TvError)
    })

    it('add() is idempotent', async () => {
      const { c } = await setup()
      const g = c.createGroup('g', [])
      g.add('BINANCE:BTCUSDT')
      g.add('BINANCE:BTCUSDT') // ignored
      expect(g.size).toBe(1)
      expect(g.has('BINANCE:BTCUSDT')).toBe(true)
    })

    it('remove() returns whether the pair was present', async () => {
      const { c } = await setup()
      const g = c.createGroup('g', ['A', 'B'])
      expect(g.remove('A')).toBe(true)
      expect(g.remove('A')).toBe(false) // second time returns false
      expect(g.size).toBe(1)
    })

    it('addAll / removeAll / clear', async () => {
      const { c } = await setup()
      const g = c.createGroup('g', [])
      g.addAll(['A', 'B', 'C'])
      expect(g.size).toBe(3)
      const removed = g.removeAll(['A', 'Z']) // Z not present
      expect(removed).toBe(1)
      expect(g.size).toBe(2)
      g.clear()
      expect(g.size).toBe(0)
    })
  })

  describe('streams', () => {
    it('emits events for every pair added at construction', async () => {
      const { c, getSessionId } = await setup()
      const g = c.createGroup('g', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
      const stream = g.stream(['lp'] as const)

      const updates: string[] = []
      stream.on('update', (e) => updates.push(e.symbol))

      const sid = await getSessionId()
      pushUpdate(sid, 'BINANCE:BTCUSDT', { lp: 1 })
      pushUpdate(sid, 'BINANCE:ETHUSDT', { lp: 2 })

      await waitFor(() => updates.length === 2)
      expect(new Set(updates)).toEqual(new Set(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT']))

      stream.close()
    })

    it('live-adds pairs to active streams via group.add()', async () => {
      const { c, getSessionId } = await setup()
      const g = c.createGroup('g', ['A:B'])
      const stream = g.stream(['lp'] as const)

      const seen: string[] = []
      stream.on('price', (e) => seen.push(e.symbol))

      const sid = await getSessionId()
      pushUpdate(sid, 'A:B', { lp: 1 })
      await waitFor(() => seen.length === 1)

      g.add('C:D')
      pushUpdate(sid, 'C:D', { lp: 2 })
      await waitFor(() => seen.length === 2)

      expect(seen).toEqual(['A:B', 'C:D'])
      stream.close()
    })

    it('live-removes pairs from active streams via group.remove()', async () => {
      const { c, getSessionId } = await setup()
      const g = c.createGroup('g', ['A:B', 'C:D'])
      const stream = g.stream(['lp'] as const)

      const seen: string[] = []
      stream.on('price', (e) => seen.push(e.symbol))

      const sid = await getSessionId()
      pushUpdate(sid, 'A:B', { lp: 1 })
      pushUpdate(sid, 'C:D', { lp: 2 })
      await waitFor(() => seen.length === 2)

      g.remove('A:B')
      pushUpdate(sid, 'A:B', { lp: 99 }) // ignored by this stream
      pushUpdate(sid, 'C:D', { lp: 3 })
      await waitFor(() => seen.length === 3)

      expect(seen).toEqual(['A:B', 'C:D', 'C:D'])
      stream.close()
    })

    it('delete() closes active streams and removes the group from the registry', async () => {
      const { c, getSessionId } = await setup()
      const g = c.createGroup('tmp', ['A:B'])
      const stream = g.stream(['lp'] as const)

      const seen: string[] = []
      stream.on('update', (e) => seen.push(e.symbol))

      const sid = await getSessionId()
      pushUpdate(sid, 'A:B', { lp: 1 })
      await waitFor(() => seen.length === 1)

      await g.delete()
      expect(c.groups.has('tmp')).toBe(false)
      expect(stream.isClosed).toBe(true)
    })

    it('rejects mutation after delete()', async () => {
      const { c } = await setup()
      const g = c.createGroup('tmp', [])
      await g.delete()
      expect(() => g.add('X')).toThrow(TvError)
      expect(() => g.remove('X')).toThrow(TvError)
    })
  })

  describe('dedup on client.stream()', () => {
    it('fires one event per symbol across overlapping groups', async () => {
      const { c, getSessionId } = await setup()

      // Two groups sharing 'BTC'
      c.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
      c.createGroup('watchlist', ['BINANCE:BTCUSDT', 'NASDAQ:AAPL'])

      const aggregate = c.stream(['lp'] as const)
      const events: string[] = []
      aggregate.on('update', (e) => events.push(e.symbol))

      const sid = await getSessionId()
      // Single BTC tick — should fire exactly once on the aggregate.
      pushUpdate(sid, 'BINANCE:BTCUSDT', { lp: 72000 })

      // Give time for any duplicate emission to land.
      await waitFor(() => events.length >= 1)
      await new Promise((r) => setTimeout(r, 30))

      expect(events.filter((s) => s === 'BINANCE:BTCUSDT')).toHaveLength(1)
      aggregate.close()
    })
  })
})
