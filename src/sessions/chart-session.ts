/**
 * ChartSession — manages a TradingView `chart_create_session` container.
 *
 * This session type is used for historical candle data and live bar
 * updates. A typical flow:
 *
 *   1. `chart_create_session` to open the container
 *   2. `resolve_symbol` to bind a symbol key (e.g. `sym_1`) to a market pair
 *   3. `create_series` to request N bars for that symbol at a timeframe
 *   4. Receive `timescale_update` (initial bars) and subsequent `du`
 *      (data update) messages as bars tick
 *   5. `chart_delete_session` on teardown
 *
 * This class wraps all of that into a simple callback-driven API. A
 * higher-level layer (Phase 4 `Symbol.candles()`) will consume it via
 * a promise-returning helper.
 */

import { createLogger } from '../utils/logger.js'
import { randomId } from '../utils/random-id.js'
import { TvError, TvSymbolError, TvTimeoutError } from '../core/errors.js'
import type { SessionManager } from '../core/session-manager.js'
import { normalizeTimeframe } from '../types/candle.js'
import type { Candle, Timeframe } from '../types/candle.js'
import type { CandlesUpdate, CandleTick, Session } from './session.types.js'

const log = createLogger('session:chart')

export type { Timeframe }

export interface SeriesRequest {
  /** Full TradingView pair, e.g. `'BINANCE:BTCUSDT'`. */
  symbol: string
  /** Candle timeframe (TradingView native, e.g. `'60'` for 1h, `'1D'` for daily). */
  timeframe: Timeframe
  /** Number of bars to request on initial load. */
  barCount: number
}

export interface ChartSessionOptions {
  manager: SessionManager
  /** Called when a batch of bars arrives on a series (initial load). */
  onCandles?: (update: CandlesUpdate) => void
  /** Called when a single bar ticks live after the initial load. */
  onTick?: (tick: CandleTick) => void
  /** Called when TradingView rejects a symbol or a series. */
  onError?: (err: TvSymbolError) => void
}

interface InternalSeries {
  seriesId: string
  symbolKey: string
  request: SeriesRequest
  /** Timeframe already normalized to the TradingView wire format. */
  rawTimeframe: string
  resolved: boolean
  initialLoaded: boolean
}

interface PendingResolve {
  pair: string
  resolve: (info: Record<string, unknown>) => void
  reject: (err: Error) => void
}

interface PendingCandles {
  symbol: string
  resolve: (candles: Candle[]) => void
  reject: (err: Error) => void
}

export class ChartSession implements Session {
  readonly id: string
  private readonly manager: SessionManager
  private readonly series = new Map<string, InternalSeries>() // by seriesId
  private readonly seriesBySymbolKey = new Map<string, InternalSeries>() // by symbolKey
  private nextSymbolSeq = 1
  private nextSeriesSeq = 1
  private created = false
  private disposed = false

  private readonly onCandlesCb?: (update: CandlesUpdate) => void
  private readonly onTickCb?: (tick: CandleTick) => void
  private readonly onErrorCb?: (err: TvSymbolError) => void

  // One-shot helpers — see `resolvePair()` and `fetchCandlesOnce()`.
  private readonly pendingResolves = new Map<string, PendingResolve>() // by symbolKey
  private readonly pendingCandles = new Map<string, PendingCandles>() // by seriesId

  constructor(opts: ChartSessionOptions) {
    this.id = `cs_${randomId(12)}`
    this.manager = opts.manager
    this.onCandlesCb = opts.onCandles
    this.onTickCb = opts.onTick
    this.onErrorCb = opts.onError

    this.manager.registerSession(this)
    this.sendCreate()
  }

  /**
   * Request a series of bars for a symbol. The `onCandles` callback is
   * invoked once the initial batch arrives; subsequent bar updates come
   * through `onTick`.
   *
   * Returns the generated `seriesId`, which can be used with
   * `requestMore()` to fetch additional historical bars.
   */
  requestSeries(request: SeriesRequest): string {
    if (this.disposed) throw new Error('ChartSession has been disposed')

    const rawTimeframe = normalizeTimeframe(request.timeframe)
    const symbolKey = `sym_${this.nextSymbolSeq++}`
    const seriesId = `sds_${this.nextSeriesSeq++}`
    const internal: InternalSeries = {
      seriesId,
      symbolKey,
      request,
      rawTimeframe,
      resolved: false,
      initialLoaded: false,
    }
    this.series.set(seriesId, internal)
    this.seriesBySymbolKey.set(symbolKey, internal)

    this.manager.sendCommand('resolve_symbol', [
      this.id,
      symbolKey,
      `={"symbol":"${request.symbol}","adjustment":"splits"}`,
    ])
    this.manager.sendCommand('create_series', [
      this.id,
      seriesId,
      seriesId,
      symbolKey,
      rawTimeframe,
      request.barCount,
      '',
    ])

    log('requestSeries %s → %s %s x%d', request.symbol, seriesId, rawTimeframe, request.barCount)
    return seriesId
  }

  /** Request additional historical bars for an existing series. */
  requestMore(seriesId: string, additionalBars: number): void {
    if (this.disposed) return
    const s = this.series.get(seriesId)
    if (!s) {
      log('requestMore: unknown seriesId %s', seriesId)
      return
    }
    this.manager.sendCommand('request_more_data', [this.id, seriesId, additionalBars])
  }

  /** Remove a series (stop receiving updates for it). */
  removeSeries(seriesId: string): void {
    if (this.disposed) return
    const s = this.series.get(seriesId)
    if (!s) return
    this.manager.sendCommand('remove_series', [this.id, seriesId])
    this.series.delete(seriesId)
    this.seriesBySymbolKey.delete(s.symbolKey)
  }

  /** All active series keyed by `seriesId`. */
  getSeries(): ReadonlyMap<string, { symbol: string; timeframe: string }> {
    const out = new Map<string, { symbol: string; timeframe: string }>()
    for (const [id, s] of this.series) {
      out.set(id, { symbol: s.request.symbol, timeframe: s.rawTimeframe })
    }
    return out
  }

  /**
   * Promise-based helper: resolve a symbol without creating a series.
   * Returns the raw `symbol_resolved` payload from TradingView.
   *
   * Useful for fetching symbol metadata (description, exchange, type,
   * session hours, etc.) without paying for a candle subscription.
   */
  async resolvePair(pair: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
    if (this.disposed) throw new TvError('ChartSession has been disposed')

    const symbolKey = `sym_${this.nextSymbolSeq++}`

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolves.delete(symbolKey)
        reject(new TvTimeoutError(`resolvePair(${pair})`, timeoutMs))
      }, timeoutMs)

      this.pendingResolves.set(symbolKey, {
        pair,
        resolve: (info) => {
          clearTimeout(timer)
          resolve(info)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })

      this.manager.sendCommand('resolve_symbol', [
        this.id,
        symbolKey,
        `={"symbol":"${pair}","adjustment":"splits"}`,
      ])
    })
  }

  /**
   * Promise-based helper: fetch a historical candle window in one call.
   * Creates a temporary series, waits for the initial backfill, then
   * removes the series and returns the candles.
   */
  async fetchCandlesOnce(
    symbol: string,
    opts: { timeframe: Timeframe; barCount: number },
    timeoutMs = 15_000,
  ): Promise<Candle[]> {
    if (this.disposed) throw new TvError('ChartSession has been disposed')

    return new Promise<Candle[]>((resolve, reject) => {
      let seriesId: string
      const timer = setTimeout(() => {
        this.pendingCandles.delete(seriesId)
        reject(new TvTimeoutError(`fetchCandlesOnce(${symbol})`, timeoutMs))
      }, timeoutMs)

      try {
        seriesId = this.requestSeries({
          symbol,
          timeframe: opts.timeframe,
          barCount: opts.barCount,
        })
      } catch (err) {
        clearTimeout(timer)
        reject(err as Error)
        return
      }

      this.pendingCandles.set(seriesId, {
        symbol,
        resolve: (candles) => {
          clearTimeout(timer)
          this.removeSeries(seriesId)
          resolve(candles)
        },
        reject: (err) => {
          clearTimeout(timer)
          this.removeSeries(seriesId)
          reject(err)
        },
      })
    })
  }

  /** Close the chart session on the server and release local state. */
  async delete(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    // Reject any pending one-shot promises so callers don't hang.
    for (const p of this.pendingResolves.values()) {
      p.reject(new TvError('ChartSession deleted before resolve'))
    }
    this.pendingResolves.clear()
    for (const p of this.pendingCandles.values()) {
      p.reject(new TvError('ChartSession deleted before candles delivered'))
    }
    this.pendingCandles.clear()

    if (this.created) {
      this.manager.sendCommand('chart_delete_session', [this.id])
    }
    this.manager.unregisterSession(this.id)
    this.series.clear()
    this.seriesBySymbolKey.clear()
  }

  // ─── Session interface ─────────────────────────────────────

  handleMessage(method: string, params: unknown[]): void {
    switch (method) {
      case 'symbol_resolved':
        this.handleSymbolResolved(params)
        break
      case 'symbol_error':
        this.handleSymbolError(params)
        break
      case 'series_loading':
        // Just an ack that the series has been accepted; nothing to do.
        break
      case 'series_completed':
        // Historical load complete — initialLoaded is set inside du/timescale_update.
        break
      case 'series_error':
        this.handleSeriesError(params)
        break
      case 'timescale_update':
      case 'du':
        this.handleSeriesData(method, params)
        break
      default:
        log('ignoring unknown method %s', method)
    }
  }

  handleDisconnect(): void {
    this.created = false
    for (const s of this.series.values()) {
      s.resolved = false
      s.initialLoaded = false
    }
  }

  replay(): void {
    if (this.disposed) return
    log('replay %s: %d series', this.id, this.series.size)
    this.sendCreate()
    // Re-resolve and re-create every series.
    for (const s of this.series.values()) {
      this.manager.sendCommand('resolve_symbol', [
        this.id,
        s.symbolKey,
        `={"symbol":"${s.request.symbol}","adjustment":"splits"}`,
      ])
      this.manager.sendCommand('create_series', [
        this.id,
        s.seriesId,
        s.seriesId,
        s.symbolKey,
        s.rawTimeframe,
        s.request.barCount,
        '',
      ])
    }
  }

  // ─── private ───────────────────────────────────────────────

  private sendCreate(): void {
    this.manager.sendCommand('chart_create_session', [this.id])
    this.created = true
  }

  private handleSymbolResolved(params: unknown[]): void {
    const symbolKey = params[1]
    if (typeof symbolKey !== 'string') return

    // Promise-based one-shot resolve takes priority.
    const pending = this.pendingResolves.get(symbolKey)
    if (pending) {
      this.pendingResolves.delete(symbolKey)
      const info = params[2]
      if (typeof info === 'object' && info !== null) {
        pending.resolve(info as Record<string, unknown>)
      } else {
        pending.reject(new TvError(`Invalid symbol_resolved payload for ${pending.pair}`))
      }
      return
    }

    // Otherwise it's attached to a running series.
    const series = this.seriesBySymbolKey.get(symbolKey)
    if (!series) return
    series.resolved = true
  }

  private handleSymbolError(params: unknown[]): void {
    const symbolKey = params[1]
    if (typeof symbolKey !== 'string') return

    const reason = typeof params[2] === 'string' ? params[2] : 'symbol_error'

    // Reject the one-shot resolver if present.
    const pending = this.pendingResolves.get(symbolKey)
    if (pending) {
      this.pendingResolves.delete(symbolKey)
      pending.reject(new TvSymbolError(pending.pair, reason))
      return
    }

    const series = this.seriesBySymbolKey.get(symbolKey)
    if (!series) return
    this.onErrorCb?.(new TvSymbolError(series.request.symbol, reason))
    // Also reject any pending candles tied to this series.
    const pendingCandles = this.pendingCandles.get(series.seriesId)
    if (pendingCandles) {
      this.pendingCandles.delete(series.seriesId)
      pendingCandles.reject(new TvSymbolError(series.request.symbol, reason))
    }
    this.series.delete(series.seriesId)
    this.seriesBySymbolKey.delete(symbolKey)
  }

  private handleSeriesError(params: unknown[]): void {
    const seriesId = params[1]
    if (typeof seriesId !== 'string') return
    const series = this.series.get(seriesId)
    if (!series) return
    const reason = typeof params[2] === 'string' ? params[2] : 'series_error'
    this.onErrorCb?.(new TvSymbolError(series.request.symbol, reason))
    this.series.delete(seriesId)
    this.seriesBySymbolKey.delete(series.symbolKey)
  }

  /**
   * Handle `timescale_update` and `du` (data update). Both carry a
   * payload of the form:
   *
   *   { sds_1: { s: [ { i, v: [time, open, high, low, close, volume] }, ... ] } }
   *
   * `timescale_update` is typically the initial historical dump;
   * subsequent `du` updates usually contain only the last tick.
   */
  private handleSeriesData(method: string, params: unknown[]): void {
    const payload = params[1]
    if (typeof payload !== 'object' || payload === null) return

    for (const [seriesId, value] of Object.entries(payload)) {
      const series = this.series.get(seriesId)
      if (!series) continue

      const candles = extractCandles(value)
      if (candles.length === 0) continue

      // Heuristic: an update larger than 1 bar is part of the historical
      // backfill. A single-bar update is a live tick.
      const isBackfill = method === 'timescale_update' || candles.length > 1

      // If the backfill finishes a one-shot pending candle fetch,
      // resolve its promise (which also removes the series).
      if (isBackfill) {
        const pending = this.pendingCandles.get(seriesId)
        if (pending) {
          this.pendingCandles.delete(seriesId)
          pending.resolve(candles)
          continue
        }
      }

      if (isBackfill && !series.initialLoaded) {
        series.initialLoaded = true
        this.onCandlesCb?.({
          seriesId,
          symbol: series.request.symbol,
          candles,
        })
      } else {
        for (const candle of candles) {
          this.onTickCb?.({
            seriesId,
            symbol: series.request.symbol,
            candle,
          })
        }
      }
    }
  }
}

/**
 * Extract candles from a `sds_1`-shaped payload.
 *
 * Shape: `{ s: [ { i: number, v: [time, open, high, low, close, volume] } ] }`.
 * We tolerate missing `s` or non-numeric entries.
 */
function extractCandles(value: unknown): Candle[] {
  if (typeof value !== 'object' || value === null) return []
  const s = (value as { s?: unknown }).s
  if (!Array.isArray(s)) return []

  const out: Candle[] = []
  for (const entry of s) {
    if (typeof entry !== 'object' || entry === null) continue
    const v = (entry as { v?: unknown }).v
    if (!Array.isArray(v) || v.length < 6) continue
    const [time, open, high, low, close, volume] = v
    if (
      typeof time !== 'number' ||
      typeof open !== 'number' ||
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number' ||
      typeof volume !== 'number'
    ) {
      continue
    }
    out.push({ time, open, high, low, close, volume })
  }
  return out
}
