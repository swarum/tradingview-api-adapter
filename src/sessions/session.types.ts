/**
 * Shared types for session-level abstractions.
 *
 * A "session" in TradingView's protocol is a server-side container
 * identified by an ID (e.g. `qs_xyz` for a quote session, `cs_abc` for
 * a chart session). All commands and responses for that container
 * carry the session id as the first parameter.
 */

/**
 * Base contract every session class implements so that `SessionManager`
 * can route inbound messages and drive lifecycle events.
 */
export interface Session {
  readonly id: string

  /**
   * Called by `SessionManager` when a protocol message targets this
   * session. The method name (`method`) and the full `params` array
   * (including the session id at `params[0]`) are passed through as-is.
   */
  handleMessage(method: string, params: unknown[]): void

  /**
   * Called by `SessionManager` when the underlying transport drops.
   * The session should assume its server-side state is gone and reset
   * any "initial load complete" flags so that a reconnect re-delivers
   * the full snapshot.
   */
  handleDisconnect(): void

  /**
   * Called by `SessionManager` after the transport has successfully
   * reconnected AND the TradingView hello packet has been received.
   * The session must re-issue the commands needed to restore its
   * server-side state (create session, set fields, add symbols, …).
   */
  replay(): void
}

/** Event payload emitted when a quote delta arrives for a symbol. */
export interface QuoteUpdate {
  /** Full pair name, e.g. `'BINANCE:BTCUSDT'`. */
  symbol: string
  /** The fields that changed in this specific update. */
  delta: Record<string, unknown>
  /** The full accumulated state for this symbol after applying the delta. */
  snapshot: Record<string, unknown>
  /** `true` on the first delta for this symbol in the session. */
  isFirstLoad: boolean
}

/** Event payload emitted when a per-symbol error is reported. */
export interface QuoteErrorInfo {
  symbol: string
  message: string
}

/** Parsed OHLCV bar from a chart series. */
export interface Candle {
  /** Bar start time, UTC epoch seconds. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Event payload when a batch of candles is delivered on a series. */
export interface CandlesUpdate {
  seriesId: string
  symbol: string
  candles: Candle[]
}

/** Event payload when a single bar ticks (live streaming update). */
export interface CandleTick {
  seriesId: string
  symbol: string
  candle: Candle
}
