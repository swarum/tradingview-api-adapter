/**
 * TradingView wire protocol — pure encode/decode functions.
 *
 * This module has no side effects and no I/O. It only translates between
 * raw strings received from the WebSocket and strongly typed messages.
 *
 * See `protocol.types.ts` for a description of the frame format.
 */

import { TvProtocolError } from './errors.js'
import type {
  CommandMessage,
  HeartbeatMessage,
  HelloMessage,
  ProtocolMessage,
} from './protocol.types.js'

const FRAME_MARKER = '~m~'
const HEARTBEAT_MARKER = '~h~'

/**
 * Wrap a raw payload in the TradingView frame header.
 *
 * The payload length is measured in character-count (UTF-16 code units),
 * matching TradingView's own behaviour.
 */
export function encodeFrame(payload: string | object): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return `${FRAME_MARKER}${body.length}${FRAME_MARKER}${body}`
}

/** Build a heartbeat echo frame for a given server-provided id. */
export function encodeHeartbeat(id: number): string {
  if (!Number.isFinite(id)) {
    throw new TvProtocolError(`Invalid heartbeat id: ${id}`)
  }
  return encodeFrame(`${HEARTBEAT_MARKER}${id}`)
}

/** Build a command frame like `{ m: "quote_add_symbols", p: [...] }`. */
export function encodeCommand(method: string, params: unknown[]): string {
  return encodeFrame({ m: method, p: params })
}

/**
 * Decode a raw WebSocket message (which may contain multiple concatenated
 * frames) into an array of typed `ProtocolMessage`s.
 *
 * Throws `TvProtocolError` on malformed input.
 */
export function decodeFrames(raw: string): ProtocolMessage[] {
  if (raw.length === 0) return []

  const messages: ProtocolMessage[] = []
  let cursor = 0

  while (cursor < raw.length) {
    if (raw.slice(cursor, cursor + FRAME_MARKER.length) !== FRAME_MARKER) {
      throw new TvProtocolError(
        `Expected frame marker "~m~" at position ${cursor}, got "${raw.slice(cursor, cursor + 10)}"`,
      )
    }
    cursor += FRAME_MARKER.length

    const lengthEnd = raw.indexOf(FRAME_MARKER, cursor)
    if (lengthEnd === -1) {
      throw new TvProtocolError(`Unterminated length marker starting at position ${cursor}`)
    }

    const lengthStr = raw.slice(cursor, lengthEnd)
    const length = Number.parseInt(lengthStr, 10)
    if (!Number.isFinite(length) || length < 0 || String(length) !== lengthStr) {
      throw new TvProtocolError(`Invalid frame length: "${lengthStr}"`)
    }

    cursor = lengthEnd + FRAME_MARKER.length

    if (cursor + length > raw.length) {
      throw new TvProtocolError(
        `Truncated payload: declared ${length} chars but only ${raw.length - cursor} available`,
      )
    }

    const payload = raw.slice(cursor, cursor + length)
    cursor += length

    const parsed = parsePayload(payload)
    if (parsed !== null) messages.push(parsed)
  }

  return messages
}

function parsePayload(payload: string): ProtocolMessage | null {
  if (payload === '') return null

  if (payload.startsWith(HEARTBEAT_MARKER)) {
    const id = Number.parseInt(payload.slice(HEARTBEAT_MARKER.length), 10)
    if (!Number.isFinite(id)) {
      throw new TvProtocolError(`Invalid heartbeat payload: "${payload}"`)
    }
    const msg: HeartbeatMessage = { type: 'heartbeat', id }
    return msg
  }

  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch (err) {
    throw new TvProtocolError(`Invalid JSON payload: "${truncate(payload, 80)}"`, { cause: err })
  }

  if (isCommandShape(data)) {
    const msg: CommandMessage = {
      type: 'message',
      method: data.m,
      params: Array.isArray(data.p) ? data.p : [],
    }
    return msg
  }

  const hello: HelloMessage = { type: 'hello', data }
  return hello
}

function isCommandShape(data: unknown): data is { m: string; p: unknown } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'm' in data &&
    typeof (data as { m: unknown }).m === 'string'
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}
