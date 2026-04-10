/**
 * Typed domain model exports.
 *
 * The `src/types/` module holds every public TypeScript type a
 * consumer might reference: quote fields, candles, timeframes, symbol
 * info. Runtime helpers that are tightly coupled to these types
 * (`normalizeTimeframe`, `symbolInfoFromRaw`) are re-exported here
 * too, because splitting them would just force consumers into a
 * double import.
 */

// Quote fields
export type {
  BarTick,
  FullQuoteSnapshot,
  QuoteField,
  QuoteFieldTypeMap,
  QuoteSnapshot,
  TradeTick,
} from './quote-fields.js'

// Candles and timeframes
export type { Candle, RawTimeframe, Timeframe, TimeframeAlias } from './candle.js'
export { normalizeTimeframe, TIMEFRAME_ALIASES } from './candle.js'

// Symbol info
export type { SymbolInfo } from './symbol-info.js'
export { symbolInfoFromRaw } from './symbol-info.js'
