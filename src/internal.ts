/**
 * tradingview-api-adapter/internal
 *
 * Low-level primitives for advanced users who want to build custom
 * adapters on top of the transport / protocol / session layers.
 *
 * These exports are **semver-exempt** — breaking changes may happen in
 * minor versions. If you import from this module, pin a tight version
 * range.
 */

// Transport
export { Transport } from './core/transport.js'
export type {
  CloseInfo,
  ReconnectOptions,
  TransportOptions,
  TransportState,
} from './core/transport.types.js'

// Protocol
export { decodeFrames, encodeCommand, encodeFrame, encodeHeartbeat } from './core/protocol.js'
export type {
  CommandMessage,
  HeartbeatMessage,
  HelloMessage,
  ProtocolMessage,
} from './core/protocol.types.js'

// Rate limiter
export { SymbolBatcher } from './core/rate-limiter.js'
export { DEFAULT_RATE_LIMIT, resolveRateLimit } from './core/rate-limiter.types.js'
export type { RateLimitOptions, SymbolBatcherExecutor } from './core/rate-limiter.types.js'

// Session manager
export { SessionManager } from './core/session-manager.js'
export type { SessionManagerOptions, SessionManagerState } from './core/session-manager.types.js'

// Sessions
export { ChartSession, QuoteSession } from './sessions/index.js'
export type {
  CandlesUpdate,
  CandleTick,
  ChartSessionOptions,
  QuoteErrorInfo,
  QuoteSessionOptions,
  QuoteUpdate,
  SeriesRequest,
  Session,
} from './sessions/index.js'

// Typed domain model (Phase 3)
export type {
  BarTick,
  Candle,
  FullQuoteSnapshot,
  QuoteField,
  QuoteFieldTypeMap,
  QuoteSnapshot,
  RawTimeframe,
  SymbolInfo,
  Timeframe,
  TimeframeAlias,
  TradeTick,
} from './types/index.js'
export { normalizeTimeframe, symbolInfoFromRaw, TIMEFRAME_ALIASES } from './types/index.js'
export { kebabToCamel, transformKeys } from './utils/kebab-to-camel.js'

// Errors
export {
  TvConnectionError,
  TvError,
  TvProtocolError,
  TvSessionError,
  TvSymbolError,
  TvTimeoutError,
} from './core/errors.js'
export type { TvErrorOptions } from './core/errors.js'

// Utilities
export { calculateBackoff, DEFAULT_BACKOFF } from './utils/backoff.js'
export type { BackoffOptions } from './utils/backoff.js'
export { randomId } from './utils/random-id.js'
export { createLogger } from './utils/logger.js'
export type { Logger } from './utils/logger.js'

// Constants
export { TV_ORIGIN, TV_WS_URL } from './core/constants.js'
