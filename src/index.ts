/**
 * tradingview-api-adapter
 *
 * Real-time market data from TradingView via WebSocket.
 *
 * Quick start:
 *
 *   import { tv } from 'tradingview-api-adapter'
 *
 *   const client = tv()
 *   const btc = client.symbol('BINANCE:BTCUSDT')
 *
 *   console.log(await btc.price())
 *
 *   const stream = btc.stream()
 *   stream.on('price', ({ price }) => console.log(price))
 *
 *   await client.disconnect()
 */

// ─── Public API ──────────────────────────────────────────────
export { Client, tv } from './api/client.js'
export type { ClientEventMap, ClientOptions } from './api/client.js'

export { TvSymbol, DEFAULT_STREAM_FIELDS } from './api/symbol.js'
export type { CandlesOptions } from './api/symbol.js'

export { Stream } from './api/stream.js'
export type { StreamEventMap } from './api/stream.js'

export { MultiStream } from './api/multi-stream.js'
export type { MultiStreamEventMap, MultiStreamOptions } from './api/multi-stream.js'

export { Portfolio } from './api/portfolio.js'
export { Group } from './api/group.js'
export { GroupRegistry } from './api/group-registry.js'

// ─── Typed domain model ──────────────────────────────────────
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
export { normalizeTimeframe, TIMEFRAME_ALIASES, symbolInfoFromRaw } from './types/index.js'

// ─── Errors ──────────────────────────────────────────────────
export {
  TvConnectionError,
  TvError,
  TvProtocolError,
  TvSessionError,
  TvSymbolError,
  TvTimeoutError,
} from './core/errors.js'
export type { TvErrorOptions } from './core/errors.js'

// ─── Version ─────────────────────────────────────────────────
export const version = '2.0.0-dev'
