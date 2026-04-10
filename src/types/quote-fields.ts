/**
 * Typed TradingView quote fields.
 *
 * `QuoteFieldTypeMap` is the single source of truth mapping every
 * known quote field to its runtime TypeScript type. `QuoteField` is
 * the union of all valid field names, and `QuoteSnapshot<F>` builds a
 * Pick over the map for a given subset of fields.
 *
 * Fields come directly from TradingView's `qsd` protocol frames. The
 * naming follows TradingView's own conventions — we do NOT camelCase
 * them here, because they are used as array values passed directly to
 * `quote_set_fields`. The public API (Phase 4 `Symbol.snapshot()`)
 * returns these keys exactly as-is.
 *
 * All numeric fields are typed `number | null` because TradingView can
 * and does send `null` for values it does not have (closed markets,
 * pre-market quotes, delisted symbols, and certain instrument types).
 * Always assume `undefined` as well until `quote_completed` has fired
 * for the symbol — that is why `QuoteSnapshot<F>` wraps everything in
 * `Partial`.
 */

/** A single tick delivered in the `trade` field. */
export interface TradeTick {
  /** Server timestamp when TradingView pushed the update (stringified seconds + ms). */
  'data-update-time': string
  /** Trade price as a stringified number. */
  price: string
  /** Trade size as a stringified number. */
  size: string
  /** Exchange timestamp (stringified epoch seconds). */
  time: string
}

/** A single bar delivered in the `minute-bar` / `daily-bar` / `prev-daily-bar` fields. */
export interface BarTick {
  open: string
  high: string
  low: string
  close: string
  volume: string
  /** Bar start time (stringified epoch seconds). */
  time: string
  /** Most recent update time for this bar (stringified). */
  'update-time': string
  /** Server-side push timestamp (stringified). */
  'data-update-time': string
}

/**
 * Complete map from quote field name to its value type.
 *
 * Adding a new field: add an entry here and it automatically becomes
 * available via `QuoteField` and `QuoteSnapshot<F>`.
 */
export interface QuoteFieldTypeMap {
  // ─── Price and change ───────────────────────────────────────
  /** Last price. */
  lp: number | null
  bid: number | null
  ask: number | null
  /** Absolute change since previous close. */
  ch: number | null
  /** Percent change since previous close. */
  chp: number | null
  volume: number | null

  // ─── OHLC + prev close ──────────────────────────────────────
  open_price: number | null
  high_price: number | null
  low_price: number | null
  prev_close_price: number | null
  open_time: number | null

  // ─── Precision / formatting hints ──────────────────────────
  minmov: number
  minmove2: number
  pricescale: number
  pointvalue: number
  format: string
  fractional: boolean

  // ─── Supply and popularity ──────────────────────────────────
  popularity: number | null
  average_volume: number | null
  circulating_supply: number | null
  total_supply: number | null
  total_shares_outstanding: number | null
  total_shares_diluted: number | null
  total_value_traded: number | null

  // ─── Historical extremes ────────────────────────────────────
  all_time_high: number | null
  all_time_open: number | null
  all_time_low: number | null
  price_52_week_low: number | null
  price_52_week_high: number | null
  price_percent_change_52_week: number | null
  price_percent_change_1_week: number | null

  // ─── First bar timestamps ───────────────────────────────────
  first_bar_time_1s: number | null
  first_bar_time_1m: number | null
  first_bar_time_1d: number | null

  // ─── Realtime secondary quote fields ───────────────────────
  /** Last price time (epoch seconds). */
  lp_time: number | null
  /** Regular-trading-hours change. */
  rch: number | null
  /** Regular-trading-hours change percent. */
  rchp: number | null
  /** Regular-trading-hours close. */
  rtc: number | null
  /** Regular-trading-hours close time. */
  rtc_time: number | null

  // ─── Fundamentals (numeric) ─────────────────────────────────
  basic_eps_net_income: number | null
  beta_1_year: number | null
  market_cap_basic: number | null
  earnings_per_share_basic_ttm: number | null
  price_earnings_ttm: number | null
  dividends_yield: number | null

  // ─── Identity / metadata (strings) ──────────────────────────
  description: string
  short_name: string
  pro_name: string
  original_name: string
  exchange: string
  /** Instrument type: `'stock'`, `'crypto'`, `'forex'`, `'spot'`, `'futures'`, etc. */
  type: string
  currency_code: string
  country_code: string
  language: string
  local_description: string
  logoid: string
  sector: string
  industry: string
  timezone: string
  update_mode: string
  current_session: string
  status: string
  provider_id: string

  // ─── Booleans ───────────────────────────────────────────────
  is_tradable: boolean

  // ─── Complex ticks ─────────────────────────────────────────
  trade: TradeTick
  'minute-bar': BarTick
  'daily-bar': BarTick
  'prev-daily-bar': BarTick

  /** Free-form bundle of fundamental data attached by TradingView. */
  fundamentals: Record<string, unknown>
}

/** Union of every valid quote field name. */
export type QuoteField = keyof QuoteFieldTypeMap

/**
 * Partial snapshot of a symbol's quote, typed to the fields you asked
 * for.
 *
 * Example:
 *   const snap: QuoteSnapshot<['lp', 'bid', 'ask']> = await ...
 *   snap.lp   // number | null | undefined
 *   snap.bid  // number | null | undefined
 *
 * All fields are `?:` (optional) because TradingView delivers updates
 * as deltas — any given field may not yet have arrived for a freshly
 * subscribed symbol.
 */
export type QuoteSnapshot<F extends readonly QuoteField[] = readonly QuoteField[]> = {
  [K in F[number]]?: QuoteFieldTypeMap[K]
}

/** Full untyped snapshot with every known field as optional. */
export type FullQuoteSnapshot = Partial<QuoteFieldTypeMap>
