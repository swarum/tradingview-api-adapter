/**
 * SessionManager — glues Transport, Protocol, and per-session logic.
 *
 * Responsibilities:
 *   - Own a single `Transport` and connect/disconnect it
 *   - Auto-respond to heartbeat frames
 *   - Buffer command sends until the TradingView hello packet arrives
 *   - Route inbound command frames to the session named in `params[0]`
 *   - Replay all registered sessions after a reconnect
 *   - Provide a `sendCommand()` helper used by session classes
 */

import { decodeFrames, encodeCommand, encodeHeartbeat } from './protocol.js'
import type { CommandMessage, ProtocolMessage } from './protocol.types.js'
import { createLogger } from '../utils/logger.js'
import { TV_ORIGIN, TV_WS_URL } from './constants.js'
import { resolveRateLimit } from './rate-limiter.types.js'
import type { RateLimitOptions } from './rate-limiter.types.js'
import { Transport } from './transport.js'
import type { CloseInfo } from './transport.types.js'
import type { Session } from '../sessions/session.types.js'
import type { SessionManagerOptions, SessionManagerState } from './session-manager.types.js'

const log = createLogger('session-manager')

export class SessionManager {
  readonly transport: Transport
  readonly rateLimit: Required<RateLimitOptions>

  private readonly sessions = new Map<string, Session>()
  private helloData: unknown = null
  private state: SessionManagerState = 'idle'
  private readyWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = []
  private hasEverConnected = false
  private disposed = false

  constructor(opts: SessionManagerOptions = {}) {
    this.rateLimit = resolveRateLimit(opts.rateLimit)

    this.transport = new Transport({
      url: opts.url ?? TV_WS_URL,
      origin: opts.origin ?? TV_ORIGIN,
      agent: opts.agent,
      reconnect: opts.reconnect,
      signal: opts.signal,
      onOpen: () => this.handleTransportOpen(),
      onClose: (info) => this.handleTransportClose(info),
      onMessage: (raw) => this.handleRawMessage(raw),
      onReconnect: ({ attempt, delayMs }) => {
        log('reconnect scheduled attempt=%d delay=%dms', attempt, delayMs)
        this.state = 'reconnecting'
      },
      onError: (err) => log('transport error: %s', err.message),
    })
  }

  /** Current manager state. */
  getState(): SessionManagerState {
    return this.state
  }

  /** The TradingView hello packet from the most recent connection, if any. */
  getHelloData(): unknown {
    return this.helloData
  }

  /** Number of currently registered sessions. */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Open the transport and wait until the TradingView hello packet is
   * received — only after that are session commands safe to send.
   */
  async connect(): Promise<void> {
    if (this.disposed) throw new Error('SessionManager has been disposed')
    if (this.state === 'ready') return
    this.state = 'connecting'
    await this.transport.connect()
    await this.waitForReady()
  }

  /**
   * Gracefully close the transport and release all sessions. After
   * `disconnect()` the manager cannot be reused.
   */
  async disconnect(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    log('disconnect(): %d active sessions', this.sessions.size)

    for (const session of this.sessions.values()) {
      session.handleDisconnect()
    }
    this.sessions.clear()

    this.rejectReadyWaiters(new Error('SessionManager disconnected'))

    await this.transport.close()
    this.state = 'closed'
  }

  /**
   * Register a session so `SessionManager` can route inbound messages
   * to it and include it in replay after reconnect.
   */
  registerSession(session: Session): void {
    if (this.disposed) throw new Error('SessionManager has been disposed')
    if (this.sessions.has(session.id)) {
      throw new Error(`Session id collision: ${session.id}`)
    }
    this.sessions.set(session.id, session)
    log('register: %s (total=%d)', session.id, this.sessions.size)
  }

  /** Remove a session from the routing table. */
  unregisterSession(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      log('unregister: %s (total=%d)', sessionId, this.sessions.size)
    }
  }

  /** Send a `{ m: method, p: params }` command over the transport. */
  sendCommand(method: string, params: unknown[]): void {
    this.transport.send(encodeCommand(method, params))
  }

  // ─── transport wiring ───────────────────────────────────────

  private handleTransportOpen(): void {
    log('transport open')
    // We don't transition to 'ready' here — we wait for the hello packet
    // to arrive, so sessions don't send commands into an unprimed
    // TradingView session.
  }

  private handleTransportClose(info: CloseInfo): void {
    log('transport close: code=%d', info.code)
    if (this.disposed) return
    this.state = 'reconnecting'
    this.helloData = null
    // Reset per-session loaded state so a successful replay re-delivers
    // the full snapshot.
    for (const session of this.sessions.values()) {
      try {
        session.handleDisconnect()
      } catch (err) {
        log('session.handleDisconnect threw: %s', (err as Error).message)
      }
    }
  }

  private handleRawMessage(raw: string): void {
    let frames: ProtocolMessage[]
    try {
      frames = decodeFrames(raw)
    } catch (err) {
      log('decode error: %s', (err as Error).message)
      return
    }

    for (const frame of frames) {
      switch (frame.type) {
        case 'heartbeat':
          this.transport.send(encodeHeartbeat(frame.id))
          break
        case 'hello':
          this.handleHello(frame.data)
          break
        case 'message':
          this.routeCommand(frame)
          break
      }
    }
  }

  private handleHello(data: unknown): void {
    this.helloData = data
    log('hello received')

    const wasReconnect = this.hasEverConnected
    this.hasEverConnected = true
    this.state = 'ready'

    if (wasReconnect) {
      // Replay all active sessions in declaration order.
      log('replaying %d sessions after reconnect', this.sessions.size)
      for (const session of this.sessions.values()) {
        try {
          session.replay()
        } catch (err) {
          log('session.replay threw: %s', (err as Error).message)
        }
      }
    }

    this.resolveReadyWaiters()
  }

  private routeCommand(frame: CommandMessage): void {
    const sessionId = frame.params[0]
    if (typeof sessionId !== 'string') {
      log('unrouted (no session id): method=%s', frame.method)
      return
    }
    const session = this.sessions.get(sessionId)
    if (!session) {
      log('message for unknown session %s: method=%s', sessionId, frame.method)
      return
    }
    try {
      session.handleMessage(frame.method, frame.params)
    } catch (err) {
      log('session.handleMessage threw: %s', (err as Error).message)
    }
  }

  // ─── ready promise machinery ────────────────────────────────

  private waitForReady(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject })
    })
  }

  private resolveReadyWaiters(): void {
    const waiters = this.readyWaiters
    this.readyWaiters = []
    for (const w of waiters) w.resolve()
  }

  private rejectReadyWaiters(err: Error): void {
    const waiters = this.readyWaiters
    this.readyWaiters = []
    for (const w of waiters) w.reject(err)
  }
}
