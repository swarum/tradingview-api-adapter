/**
 * OHLCV candle types and timeframe definitions.
 */

import { TvError } from '../core/errors.js'

/** A single OHLCV bar. All times are UTC epoch seconds. */
export interface Candle {
  /** Bar start time, UTC epoch seconds. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * TradingView-native timeframe strings — these are the exact values
 * sent on the wire in `create_series`. Minute-based values are the
 * count of minutes ("60" = 1 hour, "240" = 4 hours).
 *
 * Case matters: lower-case `m` is never used raw — see `TimeframeAlias`.
 */
export type RawTimeframe =
  | '1'
  | '3'
  | '5'
  | '15'
  | '30'
  | '45'
  | '60'
  | '120'
  | '180'
  | '240'
  | '360'
  | '480'
  | '720'
  | '1D'
  | '3D'
  | '1W'
  | '1M'
  | '3M'
  | '6M'
  | '12M'

/**
 * Human-friendly timeframe aliases. Case-sensitive:
 *   - lowercase `m` = minute
 *   - uppercase `M` = month (use `RawTimeframe`'s `'1M'` / `'3M'` directly)
 */
export type TimeframeAlias =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '45m'
  | '1h'
  | '2h'
  | '3h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'

/** Any value accepted by the public API. Normalized to `RawTimeframe` before going on the wire. */
export type Timeframe = RawTimeframe | TimeframeAlias

/**
 * Lookup table mapping every accepted `Timeframe` value to the
 * TradingView-native string. The `Record<Timeframe, RawTimeframe>`
 * constraint guarantees exhaustive coverage at compile time.
 */
const TIMEFRAME_MAP: Record<Timeframe, RawTimeframe> = {
  // Raw timeframes (identity)
  '1': '1',
  '3': '3',
  '5': '5',
  '15': '15',
  '30': '30',
  '45': '45',
  '60': '60',
  '120': '120',
  '180': '180',
  '240': '240',
  '360': '360',
  '480': '480',
  '720': '720',
  '1D': '1D',
  '3D': '3D',
  '1W': '1W',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '12M': '12M',

  // Human aliases
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '45m': '45',
  '1h': '60',
  '2h': '120',
  '3h': '180',
  '4h': '240',
  '6h': '360',
  '8h': '480',
  '12h': '720',
  '1d': '1D',
  '3d': '3D',
  '1w': '1W',
}

/**
 * Convert any accepted `Timeframe` value to the raw TradingView string
 * that must be sent on the wire.
 *
 * Throws `TvError` if called with a string that isn't a known timeframe.
 * This exists as a runtime guard for values coming from untyped
 * sources (JSON config files, user input, etc.).
 */
export function normalizeTimeframe(tf: Timeframe | string): RawTimeframe {
  const out = TIMEFRAME_MAP[tf as Timeframe]
  if (!out) {
    throw new TvError(`Unknown timeframe: "${tf}"`)
  }
  return out
}

/** Runtime list of every valid timeframe alias, useful for docs and validation. */
export const TIMEFRAME_ALIASES: readonly Timeframe[] = Object.keys(TIMEFRAME_MAP) as Timeframe[]
