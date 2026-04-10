/**
 * Types for the TradingView wire protocol.
 *
 * TradingView frames incoming data as `~m~<length>~m~<payload>` where
 * `<length>` is the decimal character length of `<payload>`. A single
 * WebSocket message may contain one or more back-to-back frames.
 *
 * Payloads come in three flavours:
 *
 *   1. Heartbeat:  `~h~<number>` — server pings, client echoes back
 *   2. Hello:      a JSON object without an `m` field, sent once after
 *                  the connection is established (server/session info)
 *   3. Message:    a JSON object of the form `{ "m": <method>, "p": <params> }`
 */

export type ProtocolMessage = HeartbeatMessage | HelloMessage | CommandMessage

export interface HeartbeatMessage {
  type: 'heartbeat'
  /** Sequence number sent by the server; must be echoed back unchanged. */
  id: number
}

export interface HelloMessage {
  type: 'hello'
  /** Arbitrary JSON payload from the initial server handshake. */
  data: unknown
}

export interface CommandMessage {
  type: 'message'
  /** The `m` field of the inbound JSON — e.g. `'qsd'`, `'quote_completed'`. */
  method: string
  /** The `p` field of the inbound JSON. */
  params: unknown[]
}
