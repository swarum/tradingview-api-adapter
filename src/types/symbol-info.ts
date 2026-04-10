/**
 * Typed SymbolInfo — the camelCase view of TradingView's raw
 * `symbol_resolved` payload.
 *
 * All fields are optional because TradingView emits different subsets
 * for different instrument types (crypto vs stock vs forex etc.).
 * Consumers should defensively check presence before use.
 *
 * The raw → typed conversion is a single pass through `transformKeys`
 * (see `utils/kebab-to-camel.ts`). Any field TradingView adds in the
 * future will automatically surface on the returned object (with type
 * `unknown`) even if it isn't declared here.
 */

import { transformKeys } from '../utils/kebab-to-camel.js'

export interface SymbolInfo {
  // ─── Identity ─────────────────────────────────────────────
  seriesKey?: string
  baseName?: string[]
  symbol?: string
  symbolFullname?: string
  feedTicker?: string
  exchangeListedSymbol?: string

  shortName?: string
  proName?: string
  originalName?: string
  symbolPrimaryName?: string
  symbolProname?: string

  // ─── Session and trading hours ─────────────────────────────
  sessionId?: string
  sessionRegular?: string
  sessionExtended?: string
  sessionDisplay?: string
  sessionRegularDisplay?: string
  sessionExtendedDisplay?: string
  subsessions?: unknown[]
  subsessionId?: string
  currentSession?: string
  marketStatus?: {
    phase?: string
    tradingday?: string
  }

  // ─── Exchange and venue ────────────────────────────────────
  exchange?: string
  exchangeTraded?: string
  listedExchange?: string
  providerId?: string
  group?: string

  // ─── Descriptive ───────────────────────────────────────────
  description?: string
  shortDescription?: string
  type?: string

  // ─── Currency ──────────────────────────────────────────────
  currencyCode?: string
  currencyId?: string
  baseCurrency?: string
  baseCurrencyId?: string
  currencyLogoid?: string
  baseCurrencyLogoid?: string

  // ─── Precision ─────────────────────────────────────────────
  maxPrecision?: number
  variableTickSize?: string

  // ─── Capability flags ──────────────────────────────────────
  isTradable?: boolean
  hasDepth?: boolean
  fundamentalData?: boolean
  fractional?: boolean
  feedHasIntraday?: boolean
  hasIntraday?: boolean
  isReplayable?: boolean
  hasPriceSnapshot?: boolean
  feedHasDwm?: boolean
  hasNoBbo?: boolean
  hasNoVolume?: boolean
  hasDwm?: boolean

  // ─── Popularity ────────────────────────────────────────────
  popularityRank?: number
  localPopularity?: Record<string, number>
  localPopularityRank?: Record<string, number>

  // ─── Internal / misc ───────────────────────────────────────
  perms?: Record<string, unknown>
  proPerm?: string
  historyTag?: string
  internalStudyId?: string
  internalStudyInputs?: Record<string, unknown>
  rtLag?: string
  rtUpdateTime?: string
  timezone?: string
  feed?: string
  visiblePlotsSet?: string
  prefixes?: string[]
  brokerNames?: Record<string, unknown>
  volumeType?: string
  typespecs?: string[]

  // ─── Forward-compat: unknown future fields ─────────────────
  [key: string]: unknown
}

/**
 * Convert a raw `symbol_resolved` payload into a `SymbolInfo`.
 *
 * This is a shallow conversion — it only camelCases the top-level
 * keys. Nested objects (like `marketStatus`, `localPopularity`) keep
 * their original key casing because their keys are data, not schema
 * (country codes, phase names, etc.).
 */
export function symbolInfoFromRaw(raw: Record<string, unknown>): SymbolInfo {
  return transformKeys<SymbolInfo>(raw)
}
