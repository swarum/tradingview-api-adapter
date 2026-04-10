/**
 * Error hierarchy for tradingview-api-adapter.
 *
 * All errors thrown by the library extend `TvError`, so consumers can
 * catch them all with a single `instanceof TvError` check. Specific
 * error classes are provided for the common failure modes.
 */

export interface TvErrorOptions {
  cause?: unknown
}

export class TvError extends Error {
  public override readonly cause?: unknown

  constructor(message: string, options: TvErrorOptions = {}) {
    super(message)
    this.name = this.constructor.name
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

/** Raised when the WebSocket transport fails to connect or is lost. */
export class TvConnectionError extends TvError {}

/** Raised when incoming bytes cannot be parsed as a valid TradingView frame. */
export class TvProtocolError extends TvError {}

/** Raised when a session-level operation fails (quote/chart session). */
export class TvSessionError extends TvError {}

/** Raised when a specific symbol cannot be resolved or subscribed. */
export class TvSymbolError extends TvError {
  constructor(
    public readonly symbol: string,
    message: string,
    options: TvErrorOptions = {},
  ) {
    super(`[${symbol}] ${message}`, options)
  }
}

/** Raised when an operation exceeds its configured timeout. */
export class TvTimeoutError extends TvError {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    options: TvErrorOptions = {},
  ) {
    super(`${message} (timeout=${timeoutMs}ms)`, options)
  }
}
