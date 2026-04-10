/**
 * Transport — WebSocket lifecycle with reconnect and message buffering.
 *
 * Responsibilities:
 *   - Open / close / destroy the socket
 *   - Buffer outbound messages until connected, then flush
 *   - Reconnect with exponential backoff + jitter on unexpected drops
 *   - Surface raw inbound messages via `onMessage` callback
 *   - Integrate with `AbortSignal` for external cancellation
 *
 * Non-responsibilities:
 *   - TradingView frame encoding/decoding (see `protocol.ts`)
 *   - Session management (see phase 2: `session-manager.ts`)
 *   - Heartbeat handling (composed at the SessionManager layer)
 */

// `import type` is erased at compile time — it does NOT cause the `ws`
// module to be loaded in browser bundles. The actual runtime import
// happens dynamically inside `loadNodeWs()` below, which is only
// reached in Node-like runtimes.
import type { WebSocket as NodeWebSocket, ClientOptions as NodeWsOptions } from 'ws'
import { calculateBackoff } from '../utils/backoff.js'
import { createLogger } from '../utils/logger.js'
import { TvConnectionError } from './errors.js'
import type { CloseInfo, TransportOptions, TransportState } from './transport.types.js'

const log = createLogger('transport')

const DEFAULT_MAX_ATTEMPTS = 10

// Use a local interface instead of `typeof import('ws')` so ESLint's
// consistent-type-imports rule is happy (it forbids `import()` type
// annotations in favour of top-level `import type`, which we already
// do above).
interface NodeWsModule {
  WebSocket: typeof NodeWebSocket
}
type AnyWebSocket = NodeWebSocket | WebSocket

/**
 * Lazily import the Node `ws` module. Cached after the first call so
 * subsequent reconnects don't pay the import cost. In browser bundles
 * this function is never called, so `ws` never hits the bundle.
 */
let cachedNodeWsModule: Promise<NodeWsModule> | null = null
function loadNodeWs(): Promise<NodeWsModule> {
  if (!cachedNodeWsModule) {
    cachedNodeWsModule = import('ws') as unknown as Promise<NodeWsModule>
  }
  return cachedNodeWsModule
}

export class Transport {
  private ws: AnyWebSocket | null = null
  private state: TransportState = 'idle'
  private buffer: string[] = []
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  private readonly onAbort = (): void => {
    log('aborted via signal')
    this.destroy()
  }

  constructor(private readonly opts: TransportOptions) {
    if (opts.signal) {
      if (opts.signal.aborted) {
        this.state = 'closed'
        return
      }
      opts.signal.addEventListener('abort', this.onAbort, { once: true })
    }
  }

  /** Current transport state. */
  getState(): TransportState {
    return this.state
  }

  /** Number of messages currently held in the outbound buffer. */
  getBufferedCount(): number {
    return this.buffer.length
  }

  /**
   * Open the WebSocket connection. Resolves when the socket reaches the
   * `open` state, rejects if the initial handshake fails.
   *
   * Calling `connect()` on an already-open or already-connecting transport
   * is a no-op and resolves immediately.
   */
  async connect(): Promise<void> {
    if (this.state === 'open' || this.state === 'connecting') return
    if (this.opts.signal?.aborted) {
      throw new TvConnectionError('Transport aborted before connect')
    }

    this.clearReconnectTimer()
    this.manualClose = false
    this.state = 'connecting'
    log('connect() → %s', this.opts.url)

    // Phase 1: asynchronously create the underlying WebSocket. This may
    // trigger a dynamic `import('ws')` on the first call in Node.
    let ws: AnyWebSocket
    try {
      ws = await this.createSocket()
    } catch (err) {
      this.state = 'closed'
      throw new TvConnectionError('Failed to create WebSocket', { cause: err })
    }
    this.ws = ws

    // Phase 2: attach listeners and wait for the socket to reach open.
    await new Promise<void>((resolve, reject) => {
      let settled = false

      const handleOpen = (): void => {
        log('opened')
        this.state = 'open'
        this.reconnectAttempt = 0
        this.opts.onOpen?.()
        this.flushBuffer()
        if (!settled) {
          settled = true
          resolve()
        }
      }

      const handleMessage = (data: unknown): void => {
        const raw = extractMessageData(data)
        if (raw === null) return
        this.opts.onMessage?.(raw)
      }

      const handleError = (err: Error): void => {
        log('error: %s', err.message)
        this.opts.onError?.(err)
        if (!settled) {
          settled = true
          this.state = 'closed'
          reject(err)
        }
      }

      const handleClose = (info: CloseInfo): void => {
        log('closed: code=%d reason=%s wasClean=%s', info.code, info.reason, info.wasClean)
        this.ws = null
        this.opts.onClose?.(info)

        if (this.manualClose) {
          this.state = 'closed'
          if (!settled) {
            settled = true
            reject(new TvConnectionError('Closed before connection established'))
          }
          return
        }

        if (this.shouldReconnect()) {
          this.scheduleReconnect()
        } else {
          this.state = 'closed'
        }

        if (!settled) {
          settled = true
          reject(new TvConnectionError(`Closed during connect: code=${info.code}`))
        }
      }

      attachListeners(ws!, { handleOpen, handleMessage, handleError, handleClose })
    })
  }

  /**
   * Queue a message for sending.
   *
   * If the transport is not currently open, the message is buffered and
   * sent once the connection is established. The buffer has no size limit
   * — the caller is responsible for not flooding it in bad network
   * conditions.
   */
  send(data: string): void {
    const ws = this.ws
    // readyState values per the WebSocket spec: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3.
    // The underlying socket can race ahead of our tracked `state` during an
    // unexpected close — e.g. the peer kills the TCP connection but the
    // `close` event has not yet been delivered. Guard against that so the
    // message ends up safely in the buffer rather than throwing on a dead
    // socket.
    if (this.state !== 'open' || !ws || ws.readyState !== 1) {
      log('send() buffered (state=%s, len=%d)', this.state, this.buffer.length + 1)
      this.buffer.push(data)
      return
    }
    try {
      ws.send(data)
    } catch (err) {
      log('send() failed, re-buffering: %s', (err as Error).message)
      this.buffer.push(data)
    }
  }

  /**
   * Gracefully close the current connection. Disables reconnect — use
   * `connect()` again if you want to reopen.
   */
  async close(code = 1000, reason = 'Normal closure'): Promise<void> {
    if (this.state === 'closed' || this.state === 'idle') return

    this.manualClose = true
    this.clearReconnectTimer()

    const ws = this.ws
    if (!ws) {
      this.state = 'closed'
      return
    }

    await new Promise<void>((resolve) => {
      const done = (): void => {
        this.state = 'closed'
        resolve()
      }
      const timeout = setTimeout(done, 1000)

      const onFinalClose = (): void => {
        clearTimeout(timeout)
        done()
      }
      if (isNodeSocket(ws)) {
        ws.once('close', onFinalClose)
      } else {
        ws.addEventListener('close', onFinalClose, { once: true })
      }

      try {
        ws.close(code, reason)
      } catch (err) {
        log('close() threw: %s', (err as Error).message)
        clearTimeout(timeout)
        done()
      }
    })
  }

  /**
   * Forcefully tear down the transport. Cancels any pending reconnect,
   * drops the buffer, and releases event listeners. After `destroy()`
   * the transport cannot be reused.
   */
  destroy(): void {
    log('destroy()')
    this.manualClose = true
    this.clearReconnectTimer()
    this.buffer = []
    this.opts.signal?.removeEventListener('abort', this.onAbort)

    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.state = 'closed'
  }

  // ─── private ────────────────────────────────────────────────

  /**
   * Pick the right WebSocket implementation for the current runtime.
   *
   *   1. Browser-like (`window` global + `WebSocket` global): use the
   *      native `WebSocket` — `origin`/`headers`/`agent` cannot be set,
   *      they're controlled by the browser.
   *   2. Node-like: dynamically import the `ws` package so that browser
   *      bundlers can tree-shake it away. This gives us `origin`,
   *      `headers`, and `agent` for proxies.
   *   3. Fallback: if `ws` can't be loaded but native `WebSocket` is
   *      present (e.g. Bun, Deno, Cloudflare Workers, Node 22+), use
   *      that — headers simply won't be set.
   */
  private async createSocket(): Promise<AnyWebSocket> {
    const globalWs = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
    const isBrowserLike = typeof (globalThis as { window?: unknown }).window !== 'undefined'

    if (isBrowserLike && globalWs) {
      log('createSocket: using native WebSocket (browser-like runtime)')
      return new globalWs(this.opts.url)
    }

    try {
      const wsModule = await loadNodeWs()
      log('createSocket: using ws package')
      const wsOpts: NodeWsOptions = {}
      if (this.opts.origin) wsOpts.origin = this.opts.origin
      if (this.opts.agent) wsOpts.agent = this.opts.agent as NodeWsOptions['agent']
      if (this.opts.headers) wsOpts.headers = this.opts.headers
      return new wsModule.WebSocket(this.opts.url, wsOpts)
    } catch (err) {
      if (globalWs) {
        log('createSocket: ws unavailable, falling back to native WebSocket')
        return new globalWs(this.opts.url)
      }
      throw new TvConnectionError('No WebSocket implementation available in this runtime', {
        cause: err,
      })
    }
  }

  private flushBuffer(): void {
    if (this.buffer.length === 0 || !this.ws) return
    const ws = this.ws
    log('flushing %d buffered messages', this.buffer.length)
    const pending = this.buffer
    this.buffer = []
    for (const msg of pending) {
      try {
        ws.send(msg)
      } catch (err) {
        log('flush send failed, re-buffering: %s', (err as Error).message)
        this.buffer.push(msg)
      }
    }
  }

  private shouldReconnect(): boolean {
    const r = this.opts.reconnect
    if (r?.enabled === false) return false
    const max = r?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    return this.reconnectAttempt < max
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1
    const delayMs = calculateBackoff(this.reconnectAttempt, this.opts.reconnect ?? {})
    log('reconnect scheduled: attempt=%d delay=%dms', this.reconnectAttempt, delayMs)
    this.state = 'reconnecting'
    this.opts.onReconnect?.({ attempt: this.reconnectAttempt, delayMs })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => {
        log('reconnect attempt failed: %s', (err as Error).message)
      })
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────

interface ListenerBundle {
  handleOpen: () => void
  handleMessage: (data: unknown) => void
  handleError: (err: Error) => void
  handleClose: (info: CloseInfo) => void
}

function attachListeners(
  ws: AnyWebSocket,
  { handleOpen, handleMessage, handleError, handleClose }: ListenerBundle,
): void {
  if (isNodeSocket(ws)) {
    ws.on('open', handleOpen)
    ws.on('message', handleMessage)
    ws.on('error', (err: Error) => handleError(err))
    ws.on('close', (code: number, reason: Buffer) =>
      handleClose({ code, reason: reason.toString('utf8'), wasClean: code === 1000 }),
    )
  } else {
    ws.onopen = (): void => handleOpen()
    ws.onmessage = (ev: MessageEvent): void => handleMessage(ev.data)
    ws.onerror = (): void => handleError(new TvConnectionError('WebSocket error event'))
    ws.onclose = (ev: CloseEvent): void =>
      handleClose({ code: ev.code, reason: ev.reason, wasClean: ev.wasClean })
  }
}

function isNodeSocket(ws: AnyWebSocket): ws is NodeWebSocket {
  return typeof (ws as NodeWebSocket).on === 'function'
}

function extractMessageData(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return new TextDecoder('utf-8').decode(data)
  if (data instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(data))
  if (Array.isArray(data)) {
    // Node ws can deliver fragments as Buffer[]
    return data.map((part) => extractMessageData(part) ?? '').join('')
  }
  return null
}
