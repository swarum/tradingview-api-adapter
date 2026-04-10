import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionManager } from '../../src/core/session-manager.js'
import { encodeFrame } from '../../src/core/protocol.js'
import type { Session } from '../../src/sessions/session.types.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

/** Minimal stub session used to observe SessionManager behaviour. */
class StubSession implements Session {
  readonly messages: Array<{ method: string; params: unknown[] }> = []
  disconnects = 0
  replays = 0

  constructor(readonly id: string) {}

  handleMessage(method: string, params: unknown[]): void {
    this.messages.push({ method, params })
  }
  handleDisconnect(): void {
    this.disconnects++
  }
  replay(): void {
    this.replays++
  }
}

/** Build a hello frame body the server will send on connect. */
const HELLO_PAYLOAD = JSON.stringify({
  session_id: 'mock_hello',
  timestamp: 1,
  protocol: 'json',
})

describe('SessionManager', () => {
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

  function buildManager(
    overrides: ConstructorParameters<typeof SessionManager>[0] = {},
  ): SessionManager {
    manager = new SessionManager({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
      ...overrides,
    })
    return manager
  }

  describe('connect / ready', () => {
    it('reaches ready state after receiving hello', async () => {
      const m = buildManager()
      server.onClientMessage(() => {
        /* swallow */
      })
      // Server sends hello after client connects. We approximate by
      // broadcasting it as soon as the client is up.
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))

      await m.connect()
      expect(m.getState()).toBe('ready')
      expect(m.getHelloData()).toMatchObject({ session_id: 'mock_hello' })
    })

    it('auto-responds to heartbeat frames', async () => {
      const m = buildManager()
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))

      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      // Send a ping frame to all clients; the manager should echo it.
      // Frame body "~h~42" is 5 chars → "~m~5~m~~h~42".
      server.broadcast(encodeFrame('~h~42'))
      await waitFor(() => received.some((r) => r === '~m~5~m~~h~42'), {
        message: 'heartbeat was not echoed',
      })
    })
  })

  describe('session routing', () => {
    it('routes command frames to the matching session', async () => {
      const m = buildManager()
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      const session = new StubSession('qs_stub')
      m.registerSession(session)
      expect(m.getSessionCount()).toBe(1)

      const body = JSON.stringify({ m: 'qsd', p: ['qs_stub', { n: 'X', s: 'ok', v: { lp: 1 } }] })
      server.broadcast(encodeFrame(body))

      await waitFor(() => session.messages.length > 0, {
        message: 'session never received message',
      })
      expect(session.messages[0]!.method).toBe('qsd')
    })

    it('ignores messages for unknown sessions', async () => {
      const m = buildManager()
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      // No sessions registered; should not throw.
      const body = JSON.stringify({ m: 'qsd', p: ['qs_nowhere', { n: 'X', s: 'ok', v: {} }] })
      expect(() => server.broadcast(encodeFrame(body))).not.toThrow()
    })

    it('unregisterSession stops future routing', async () => {
      const m = buildManager()
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      const session = new StubSession('qs_stub')
      m.registerSession(session)
      m.unregisterSession('qs_stub')

      const body = JSON.stringify({ m: 'qsd', p: ['qs_stub', {}] })
      server.broadcast(encodeFrame(body))

      // Give time for the message to arrive.
      await new Promise((r) => setTimeout(r, 30))
      expect(session.messages).toHaveLength(0)
    })

    it('rejects duplicate session ids', async () => {
      const m = buildManager()
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      m.registerSession(new StubSession('dup'))
      expect(() => m.registerSession(new StubSession('dup'))).toThrow()
    })
  })

  describe('sendCommand', () => {
    it('sends a well-formed frame to the server', async () => {
      const m = buildManager()
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))

      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      m.sendCommand('quote_create_session', ['qs_abc'])
      await waitFor(() => received.some((r) => r.includes('quote_create_session')), {
        message: 'command not observed by server',
      })

      const frame = received.find((r) => r.includes('quote_create_session'))!
      const body = frame.replace(/^~m~\d+~m~/, '')
      expect(JSON.parse(body)).toEqual({ m: 'quote_create_session', p: ['qs_abc'] })
    })
  })

  describe('disconnect', () => {
    it('calls handleDisconnect on every registered session', async () => {
      const m = buildManager()
      server.onConnection((client) => client.send(encodeFrame(HELLO_PAYLOAD)))
      await m.connect()

      const s1 = new StubSession('a')
      const s2 = new StubSession('b')
      m.registerSession(s1)
      m.registerSession(s2)

      await m.disconnect()
      manager = null // prevent double-disconnect in afterEach

      expect(s1.disconnects).toBe(1)
      expect(s2.disconnects).toBe(1)
      expect(m.getSessionCount()).toBe(0)
    })
  })
})
