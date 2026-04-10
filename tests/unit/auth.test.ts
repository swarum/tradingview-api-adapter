/**
 * Tests for Phase 6 auth + proxy + headers plumbing.
 *
 * These tests verify that configuration options on the public
 * `Client` surface correctly reach the underlying Transport and
 * SessionManager:
 *
 *   - `auth.sessionid` / `auth.sessionidSign` → Cookie header
 *   - `auth.authToken` → `set_auth_token` command
 *   - `locale` → `set_locale` command
 *   - `agent` → forwarded to the `ws` package
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/api/client.js'
import { SessionManager } from '../../src/core/session-manager.js'
import type { Transport } from '../../src/core/transport.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'
import { waitFor } from '../helpers/wait-for.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

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

describe('Auth / locale / headers plumbing', () => {
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

  describe('set_auth_token via SessionManager', () => {
    it('sends "unauthorized_user_token" by default after hello', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))
      server.onConnection((c) => c.send(encodeFrame(HELLO)))

      const m = new SessionManager({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
      })
      await m.connect()

      await waitFor(() => received.some((r) => r.includes('set_auth_token')))
      const params = findCommand(received, 'set_auth_token')
      expect(params).toEqual(['unauthorized_user_token'])

      await m.disconnect()
    })

    it('sends the user-provided authToken if configured', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))
      server.onConnection((c) => c.send(encodeFrame(HELLO)))

      const m = new SessionManager({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
        authToken: 'my-secret-token',
      })
      await m.connect()

      await waitFor(() => received.some((r) => r.includes('set_auth_token')))
      const params = findCommand(received, 'set_auth_token')
      expect(params).toEqual(['my-secret-token'])

      await m.disconnect()
    })

    it('sends set_locale with the configured locale after set_auth_token', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))
      server.onConnection((c) => c.send(encodeFrame(HELLO)))

      const m = new SessionManager({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
        locale: ['uk', 'UA'],
      })
      await m.connect()

      await waitFor(() => received.some((r) => r.includes('set_locale')))
      const params = findCommand(received, 'set_locale')
      expect(params).toEqual(['uk', 'UA'])

      await m.disconnect()
    })

    it('re-sends set_auth_token on every reconnect', async () => {
      // Not realistic to simulate a full reconnect here without timing
      // plumbing, but we can manually call the private hello handler
      // path twice and verify the count increases.
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))
      server.onConnection((c) => c.send(encodeFrame(HELLO)))

      const m = new SessionManager({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
      })
      await m.connect()

      // Re-broadcast hello → SessionManager processes it as a replay.
      server.broadcast(encodeFrame(HELLO))
      await waitFor(() => {
        const authCount = received.filter((r) => r.includes('set_auth_token')).length
        return authCount >= 2
      })

      const authCount = received.filter((r) => r.includes('set_auth_token')).length
      expect(authCount).toBeGreaterThanOrEqual(2)

      await m.disconnect()
    })
  })

  describe('Client auth API', () => {
    it('builds a Cookie header from sessionid + sessionidSign', () => {
      // We only test that the options propagate from Client → Transport.
      // We do NOT connect — the fake agent `{ ping: true }` is not a
      // real `http.Agent`, and Node ws validates it strictly on connect.
      const fakeAgent = { ping: true }

      client = tv({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
        auth: {
          sessionid: 'abc123',
          sessionidSign: 'sig456',
          authToken: 'tok789',
        },
        agent: fakeAgent,
      })

      // Inspect the internal transport options directly — no connect needed.
      const t = (client.manager as unknown as { transport: Transport }).transport
      const opts = (t as unknown as { opts: { headers?: Record<string, string>; agent?: unknown } })
        .opts

      expect(opts.headers).toEqual({ Cookie: 'sessionid=abc123; sessionid_sign=sig456' })
      expect(opts.agent).toBe(fakeAgent)
    })

    it('omits the Cookie header entirely when no sessionid is provided', async () => {
      server.onConnection((c) => c.send(encodeFrame(HELLO)))
      client = tv({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
      })
      await client.connect()

      const t = (client.manager as unknown as { transport: Transport }).transport
      const opts = (t as unknown as { opts: { headers?: Record<string, string> } }).opts
      expect(opts.headers).toBeUndefined()
    })

    it('sessionid without sessionidSign still builds a partial Cookie header', async () => {
      server.onConnection((c) => c.send(encodeFrame(HELLO)))
      client = tv({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
        auth: { sessionid: 'onlysession' },
      })
      await client.connect()

      const t = (client.manager as unknown as { transport: Transport }).transport
      const opts = (t as unknown as { opts: { headers?: Record<string, string> } }).opts
      expect(opts.headers).toEqual({ Cookie: 'sessionid=onlysession' })
    })

    it('forwards authToken from Client.auth to SessionManager → set_auth_token', async () => {
      const received: string[] = []
      server.onClientMessage((_c, raw) => received.push(raw))
      server.onConnection((c) => c.send(encodeFrame(HELLO)))

      client = tv({
        url: server.url,
        origin: undefined,
        reconnect: { enabled: false },
        auth: { authToken: 'client-level-token' },
      })
      await client.connect()

      await waitFor(() => received.some((r) => r.includes('set_auth_token')))
      const params = findCommand(received, 'set_auth_token')
      expect(params).toEqual(['client-level-token'])
    })
  })
})
