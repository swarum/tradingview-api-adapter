import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Client, tv } from '../../src/api/client.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('Stream', () => {
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
    sessionId: () => Promise<string>
  }> {
    client = tv({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
      rateLimit: { batchWindowMs: 5, chunkSize: 100, chunkIntervalMs: 0 },
    })
    server.onConnection((c) => c.send(encodeFrame(HELLO)))
    const received: string[] = []
    server.onClientMessage((_cli, raw) => received.push(raw))
    await client.connect()

    return {
      c: client,
      received,
      sessionId: async () => {
        await waitFor(() => received.some((r) => r.includes('quote_create_session')), {
          timeout: 500,
        })
        const frame = received.find((r) => r.includes('quote_create_session'))!
        return (JSON.parse(frame.replace(/^~m~\d+~m~/, '')) as { p: [string] }).p[0]
      },
    }
  }

  function push(sessionId: string, pair: string, v: Record<string, unknown>): void {
    server.broadcast(
      encodeFrame(JSON.stringify({ m: 'qsd', p: [sessionId, { n: pair, s: 'ok', v }] })),
    )
  }

  it('fires update events with the accumulated snapshot', async () => {
    const { c, sessionId } = await setup()
    const btc = c.symbol('BINANCE:BTCUSDT')
    const stream = btc.stream(['lp', 'bid', 'ask'] as const)

    const updates: Array<{ symbol: string; data: Record<string, unknown> }> = []
    stream.on('update', (event) => updates.push(event))

    const sid = await sessionId()
    push(sid, 'BINANCE:BTCUSDT', { lp: 72000, bid: 71999, ask: 72001 })
    await waitFor(() => updates.length === 1)

    push(sid, 'BINANCE:BTCUSDT', { lp: 72050 })
    await waitFor(() => updates.length === 2)

    expect(updates[0]!.data).toMatchObject({ lp: 72000, bid: 71999, ask: 72001 })
    expect(updates[1]!.data).toMatchObject({ lp: 72050, bid: 71999, ask: 72001 })

    stream.close()
  })

  it('fires price event when lp changes', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp'] as const)

    const prices: number[] = []
    stream.on('price', ({ price }) => prices.push(price))

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 100 })
    push(sid, 'X:Y', { lp: 101 })
    push(sid, 'X:Y', { lp: 102 })
    await waitFor(() => prices.length === 3)
    expect(prices).toEqual([100, 101, 102])

    stream.close()
  })

  it('fires change event when both ch and chp are in the snapshot', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp', 'ch', 'chp'] as const)

    const changes: Array<{ value: number; percent: number }> = []
    stream.on('change', (event) => changes.push(event))

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 100, ch: 5, chp: 5.26 })
    await waitFor(() => changes.length === 1)
    expect(changes[0]).toEqual({ value: 5, percent: 5.26 })

    stream.close()
  })

  it('off() removes a registered listener', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp'] as const)

    const prices: number[] = []
    const handler = ({ price }: { price: number }): void => {
      prices.push(price)
    }
    stream.on('price', handler)

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 100 })
    await waitFor(() => prices.length === 1)

    stream.off('price', handler)
    push(sid, 'X:Y', { lp: 101 })
    await new Promise((r) => setTimeout(r, 30))
    expect(prices).toEqual([100]) // second update not observed

    stream.close()
  })

  it('close() stops future dispatches', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp'] as const)

    const updates: unknown[] = []
    stream.on('update', (e) => updates.push(e))

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 1 })
    await waitFor(() => updates.length === 1)

    stream.close()
    push(sid, 'X:Y', { lp: 2 })
    await new Promise((r) => setTimeout(r, 30))
    expect(updates.length).toBe(1)
  })

  it('Symbol.dispose triggers close()', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp'] as const)

    const updates: unknown[] = []
    stream.on('update', (e) => updates.push(e))

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 1 })
    await waitFor(() => updates.length === 1)

    stream[Symbol.dispose]()
    push(sid, 'X:Y', { lp: 2 })
    await new Promise((r) => setTimeout(r, 30))
    expect(updates.length).toBe(1)
  })

  it('async iterator yields update events and ends on close', async () => {
    const { c, sessionId } = await setup()
    const stream = c.symbol('X:Y').stream(['lp'] as const)

    const collected: number[] = []
    const iteratorDone = (async () => {
      for await (const event of stream) {
        const lp = (event.data as Record<string, unknown>).lp
        if (typeof lp === 'number') collected.push(lp)
        if (collected.length >= 3) break
      }
    })()

    const sid = await sessionId()
    push(sid, 'X:Y', { lp: 1 })
    push(sid, 'X:Y', { lp: 2 })
    push(sid, 'X:Y', { lp: 3 })

    await iteratorDone
    expect(collected).toEqual([1, 2, 3])
  })
})
