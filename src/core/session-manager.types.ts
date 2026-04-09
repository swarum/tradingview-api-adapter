/**
 * Types for the SessionManager — the layer that owns a Transport,
 * handles heartbeat auto-response, routes inbound protocol messages to
 * registered sessions, and orchestrates replay after reconnect.
 */

import type { RateLimitOptions } from './rate-limiter.types.js'
import type { ReconnectOptions } from './transport.types.js'

export interface SessionManagerOptions {
  /** WebSocket URL. Defaults to TradingView widget endpoint. */
  url?: string
  /** Origin header (Node only). Defaults to TradingView origin. */
  origin?: string
  /** HTTP/SOCKS agent for proxy support (Node only). */
  agent?: unknown
  /** Transport reconnect configuration. */
  reconnect?: ReconnectOptions
  /** Rate limit configuration applied to quote sessions created via this manager. */
  rateLimit?: RateLimitOptions
  /** Abort signal — destroys the manager and its transport when fired. */
  signal?: AbortSignal
}

export type SessionManagerState = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'closed'
