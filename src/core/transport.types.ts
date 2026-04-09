/**
 * Types for the Transport layer.
 *
 * Transport is deliberately dumb: it speaks raw strings to and from a
 * WebSocket, manages the connection lifecycle, and handles reconnect.
 * It knows nothing about TradingView's framing — that is the Protocol
 * layer's job.
 */

import type { BackoffOptions } from '../utils/backoff.js'

export type TransportState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface CloseInfo {
  code: number
  reason: string
  wasClean: boolean
}

export interface ReconnectOptions extends BackoffOptions {
  /** Enable automatic reconnect. Default: `true`. */
  enabled?: boolean
  /** Maximum reconnect attempts before giving up. Default: 10. */
  maxAttempts?: number
}

export interface TransportOptions {
  /** WebSocket URL (ws:// or wss://). */
  url: string
  /** Origin header — required by TradingView in Node. Ignored in browsers. */
  origin?: string
  /** HTTP/SOCKS agent for proxy support. Node only. */
  agent?: unknown
  /** Reconnect behaviour. Set `enabled: false` to disable. */
  reconnect?: ReconnectOptions
  /** Abort the transport and disable reconnect when signalled. */
  signal?: AbortSignal
  /** Called once per successful open (initial and after each reconnect). */
  onOpen?: () => void
  /** Called on every close, including transient drops that trigger reconnect. */
  onClose?: (info: CloseInfo) => void
  /** Called for every raw inbound WebSocket message. */
  onMessage?: (raw: string) => void
  /** Called for WebSocket errors that don't necessarily trigger a close. */
  onError?: (err: Error) => void
  /** Called when a reconnect is scheduled, before the delay elapses. */
  onReconnect?: (info: { attempt: number; delayMs: number }) => void
}
