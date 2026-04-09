import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Transport } from '../../src/core/transport.js'
import { TvConnectionError } from '../../src/core/errors.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { sleep, waitFor } from '../helpers/wait-for.js'

describe('Transport', () => {
  let server: MockServer
  const transports: Transport[] = []

  beforeEach(async () => {
    server = await startMockServer()
  })

  afterEach(async () => {
    for (const t of transports) t.destroy()
    transports.length = 0
    await server.close()
  })

  const track = (t: Transport): Transport => {
    transports.push(t)
    return t
  }

  describe('connect / close / destroy', () => {
    it('reaches open state after connect()', async () => {
      const t = track(new Transport({ url: server.url, reconnect: { enabled: false } }))
      await t.connect()
      expect(t.getState()).toBe('open')
    })

    it('calls onOpen callback', async () => {
      let opened = 0
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { enabled: false },
          onOpen: () => opened++,
        }),
      )
      await t.connect()
      expect(opened).toBe(1)
    })

    it('connect() is idempotent', async () => {
      const t = track(new Transport({ url: server.url, reconnect: { enabled: false } }))
      await t.connect()
      await t.connect()
      await t.connect()
      expect(t.getState()).toBe('open')
    })

    it('close() transitions to closed and does not reconnect', async () => {
      let reconnects = 0
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { maxAttempts: 5, initialDelayMs: 5, jitter: 0 },
          onReconnect: () => reconnects++,
        }),
      )
      await t.connect()
      await t.close()
      expect(t.getState()).toBe('closed')
      await sleep(50)
      expect(reconnects).toBe(0)
    })

    it('destroy() stops reconnect and releases state', async () => {
      const t = track(new Transport({ url: server.url, reconnect: { enabled: false } }))
      await t.connect()
      t.destroy()
      expect(t.getState()).toBe('closed')
    })

    it('rejects connect() on unreachable host', async () => {
      const t = track(
        new Transport({
          url: 'ws://localhost:1', // unlikely to be listening
          reconnect: { enabled: false },
        }),
      )
      await expect(t.connect()).rejects.toBeInstanceOf(Error)
      expect(t.getState()).toBe('closed')
    })
  })

  describe('send / buffer', () => {
    it('buffers messages sent before connect()', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))

      const t = track(new Transport({ url: server.url, reconnect: { enabled: false } }))
      t.send('queued-1')
      t.send('queued-2')
      expect(t.getBufferedCount()).toBe(2)

      await t.connect()
      await waitFor(() => received.length === 2, {
        message: 'server did not receive buffered msgs',
      })

      expect(received).toEqual(['queued-1', 'queued-2'])
      expect(t.getBufferedCount()).toBe(0)
    })

    it('sends directly when open', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))

      const t = track(new Transport({ url: server.url, reconnect: { enabled: false } }))
      await t.connect()
      t.send('hello')
      await waitFor(() => received.length === 1)
      expect(received[0]).toBe('hello')
    })
  })

  describe('onMessage', () => {
    it('surfaces inbound messages as raw strings', async () => {
      const inbound: string[] = []
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { enabled: false },
          onMessage: (raw) => inbound.push(raw),
        }),
      )
      await t.connect()
      server.broadcast('~m~5~m~hello')
      await waitFor(() => inbound.length === 1)
      expect(inbound[0]).toBe('~m~5~m~hello')
    })
  })

  describe('reconnect', () => {
    it('schedules reconnect after an unexpected close', async () => {
      const reconnectCalls: Array<{ attempt: number; delayMs: number }> = []
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { maxAttempts: 5, initialDelayMs: 10, maxDelayMs: 50, jitter: 0 },
          onReconnect: (info) => reconnectCalls.push(info),
        }),
      )
      await t.connect()
      expect(t.getState()).toBe('open')

      server.disconnectAll()
      await waitFor(() => reconnectCalls.length > 0, { message: 'reconnect was never scheduled' })
      expect(reconnectCalls[0]!.attempt).toBe(1)
    })

    it('reconnects successfully to the same server', async () => {
      let opens = 0
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { maxAttempts: 5, initialDelayMs: 5, maxDelayMs: 20, jitter: 0 },
          onOpen: () => opens++,
        }),
      )
      await t.connect()
      expect(opens).toBe(1)

      server.disconnectAll()
      await waitFor(() => opens >= 2, { timeout: 2000, message: 'transport did not reconnect' })
      expect(t.getState()).toBe('open')
    })

    it('gives up after maxAttempts', async () => {
      await server.close()
      // Server is now down; fresh transport should hit max attempts.
      const reconnects: number[] = []
      const t = track(
        new Transport({
          url: `ws://localhost:${server.port}`,
          reconnect: { maxAttempts: 3, initialDelayMs: 5, maxDelayMs: 10, jitter: 0 },
          onReconnect: ({ attempt }) => reconnects.push(attempt),
        }),
      )
      // first connect fails → triggers reconnect
      await expect(t.connect()).rejects.toBeInstanceOf(Error)
      await waitFor(() => t.getState() === 'closed', {
        timeout: 2000,
        message: 'transport never exhausted attempts',
      })
      // We expect <= maxAttempts reconnect schedules.
      expect(reconnects.length).toBeLessThanOrEqual(3)
    })

    it('does not reconnect when reconnect.enabled is false', async () => {
      let reconnects = 0
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { enabled: false },
          onReconnect: () => reconnects++,
        }),
      )
      await t.connect()
      server.disconnectAll()
      await sleep(100)
      expect(reconnects).toBe(0)
    })

    it('flushes buffered messages after reconnect', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))

      // Enqueue the message from inside the synchronous onClose callback so
      // it lands in the buffer deterministically, regardless of how fast
      // reconnect happens afterward.
      let enqueued = false
      const t: Transport = track(
        new Transport({
          url: server.url,
          reconnect: { maxAttempts: 5, initialDelayMs: 10, maxDelayMs: 50, jitter: 0 },
          onClose: () => {
            if (!enqueued) {
              enqueued = true
              t.send('after-drop')
            }
          },
        }),
      )
      await t.connect()
      expect(t.getState()).toBe('open')

      server.disconnectAll()

      await waitFor(() => received.includes('after-drop'), {
        timeout: 2000,
        message: 'buffered msg was not delivered after reconnect',
      })
    })
  })

  describe('AbortSignal', () => {
    it('rejects connect() if signal is already aborted', async () => {
      const ac = new AbortController()
      ac.abort()
      const t = track(new Transport({ url: server.url, signal: ac.signal }))
      await expect(t.connect()).rejects.toBeInstanceOf(TvConnectionError)
    })

    it('destroys the transport when aborted mid-flight', async () => {
      const ac = new AbortController()
      const t = track(
        new Transport({
          url: server.url,
          reconnect: { enabled: false },
          signal: ac.signal,
        }),
      )
      await t.connect()
      expect(t.getState()).toBe('open')

      ac.abort()
      await waitFor(() => t.getState() === 'closed')
    })
  })
})
