/**
 * Integration test: full public API stack against mock WS server.
 *
 * Unlike unit tests (which test individual classes in isolation),
 * these tests exercise the complete path from `tv()` through
 * `Client → SessionManager → Transport → mock WS server` and back.
 *
 * They verify that all layers compose correctly: hello → auth →
 * quote session → symbol subscription → delta dispatch → stream
 * events → cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/index.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'int_test', timestamp: 1, protocol: 'json' })

describe('Full-stack integration', () => {
  let server: MockServer
  let client: Client | null = null
  const received: string[] = []

  beforeEach(async () => {
    received.length = 0
    server = await startMockServer()
    server.onClientMessage((_c, raw) => received.push(raw))
    server.onConnection((c) => c.send(encodeFrame(HELLO)))
  })

  afterEach(async () => {
    if (client) {
      await client.disconnect()
      client = null
    }
    await server.close()
  })

  function getQuoteSessionId(): string {
    const frame = received.find((r) => r.includes('quote_create_session'))!
    return (JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]
  }

  function pushQsd(sessionId: string, pair: string, v: Record<string, unknown>): void {
    server.broadcast(
      encodeFrame(JSON.stringify({ m: 'qsd', p: [sessionId, { n: pair, s: 'ok', v }] })),
    )
  }

  function pushComplete(sessionId: string, pair: string): void {
    server.broadcast(encodeFrame(JSON.stringify({ m: 'quote_completed', p: [sessionId, pair] })))
  }

  it('tv() → connect → price → disconnect lifecycle', async () => {
    client = tv({
      url: server.url,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })

    const btc = client.symbol('BINANCE:BTCUSDT')
    const pricePromise = btc.price()

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))
    const sid = getQuoteSessionId()

    // Verify prologue was sent.
    expect(received.some((r) => r.includes('set_auth_token'))).toBe(true)
    expect(received.some((r) => r.includes('set_locale'))).toBe(true)

    pushQsd(sid, 'BINANCE:BTCUSDT', { lp: 72000 })
    pushComplete(sid, 'BINANCE:BTCUSDT')

    const price = await pricePromise
    expect(price).toBe(72000)

    await client.disconnect()
    client = null
  })

  it('multiple symbols share one quote session', async () => {
    client = tv({
      url: server.url,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })

    const btc = client.symbol('BINANCE:BTCUSDT')
    const eth = client.symbol('BINANCE:ETHUSDT')

    const btcPrice = btc.price()
    const ethPrice = eth.price()

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))
    const sid = getQuoteSessionId()

    // Only ONE quote_create_session should exist — symbols share the pool.
    const createCount = received.filter((r) => r.includes('quote_create_session')).length
    expect(createCount).toBe(1)

    pushQsd(sid, 'BINANCE:BTCUSDT', { lp: 72000 })
    pushQsd(sid, 'BINANCE:ETHUSDT', { lp: 3800 })
    pushComplete(sid, 'BINANCE:BTCUSDT')
    pushComplete(sid, 'BINANCE:ETHUSDT')

    expect(await btcPrice).toBe(72000)
    expect(await ethPrice).toBe(3800)
  })

  it('stream dispatches to correct symbol across groups', async () => {
    client = tv({
      url: server.url,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })

    const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
    const stream = crypto.stream(['lp'] as const)

    const updates: Array<{ symbol: string; price: number }> = []
    stream.on('price', (e) => updates.push(e))

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))
    const sid = getQuoteSessionId()

    pushQsd(sid, 'BINANCE:BTCUSDT', { lp: 100 })
    pushQsd(sid, 'BINANCE:ETHUSDT', { lp: 200 })

    await waitFor(() => updates.length >= 2)

    const btcUpdate = updates.find((u) => u.symbol === 'BINANCE:BTCUSDT')
    const ethUpdate = updates.find((u) => u.symbol === 'BINANCE:ETHUSDT')
    expect(btcUpdate?.price).toBe(100)
    expect(ethUpdate?.price).toBe(200)

    stream.close()
    await crypto.delete()
  })

  it('group.add() propagates to active stream', async () => {
    client = tv({
      url: server.url,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })

    const g = client.createGroup('g', ['A:B'])
    const stream = g.stream(['lp'] as const)

    const seen: string[] = []
    stream.on('price', (e) => seen.push(e.symbol))

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))
    const sid = getQuoteSessionId()

    pushQsd(sid, 'A:B', { lp: 1 })
    await waitFor(() => seen.length >= 1)

    // Add a new pair and verify the stream picks it up.
    g.add('C:D')
    pushQsd(sid, 'C:D', { lp: 2 })
    await waitFor(() => seen.includes('C:D'))

    expect(seen).toContain('A:B')
    expect(seen).toContain('C:D')

    stream.close()
    await g.delete()
  })

  it('client.disconnect() cleans up everything', async () => {
    client = tv({
      url: server.url,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })

    const btc = client.symbol('BINANCE:BTCUSDT')
    const stream = btc.stream(['lp'] as const)

    let closeFired = false
    client.on('close', () => {
      closeFired = true
    })

    await waitFor(() => received.some((r) => r.includes('quote_create_session')))

    await client.disconnect()
    client = null

    expect(closeFired).toBe(true)
    // Stream should be dead after disconnect.
    const updates: unknown[] = []
    stream.on('update', (e) => updates.push(e))
    await new Promise((r) => setTimeout(r, 30))
    expect(updates).toHaveLength(0)
  })
})
