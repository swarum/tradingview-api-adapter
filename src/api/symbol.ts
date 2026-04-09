/**
 * TvSymbol — the user-facing handle for a single market pair.
 *
 * Users never construct this directly. They call `client.symbol(pair)`
 * which lazily creates (or retrieves) a pooled instance.
 *
 * Responsibilities:
 *   - Aggregate every quote field any caller has asked about for this pair
 *   - Maintain a local accumulated snapshot of the latest values
 *   - Dispatch updates to all active Streams on the pair
 *   - Provide one-shot promise helpers: `price`, `snapshot`, `info`, `candles`
 *
 * `info()` and `candles()` use a fresh short-lived `ChartSession` per
 * call; `price()`, `snapshot()`, and `stream()` share the parent
 * Client's pooled quote session.
 */

import { TvError, TvSymbolError } from '../core/errors.js'
import { ChartSession } from '../sessions/chart-session.js'
import type { QuoteErrorInfo, QuoteUpdate } from '../sessions/session.types.js'
import type { Candle, Timeframe } from '../types/candle.js'
import type { FullQuoteSnapshot, QuoteField, QuoteSnapshot } from '../types/quote-fields.js'
import { symbolInfoFromRaw } from '../types/symbol-info.js'
import type { SymbolInfo } from '../types/symbol-info.js'
import { createLogger } from '../utils/logger.js'
import type { Client } from './client.js'
import { Stream } from './stream.js'

const log = createLogger('symbol')

/** Default fields used for `price()`, `snapshot()` without args, and `stream()`. */
export const DEFAULT_STREAM_FIELDS: readonly QuoteField[] = [
  'lp',
  'bid',
  'ask',
  'ch',
  'chp',
  'volume',
] as const

export interface CandlesOptions {
  timeframe: Timeframe
  /** Number of bars to fetch. */
  count: number
}

const LOAD_TIMEOUT_MS = 10_000

export class TvSymbol {
  private readonly streams = new Set<Stream>()
  private readonly snapshotState: Partial<Record<QuoteField, unknown>> = {}
  private readonly fields = new Set<QuoteField>()
  private loaded = false
  private loadWaiters: Array<(err?: Error) => void> = []
  private subscribed = false
  private disposed = false

  constructor(
    readonly client: Client,
    readonly pair: string,
  ) {}

  /** The last traded price, resolving as soon as it is available. */
  async price(): Promise<number> {
    this.assertAlive()
    if (typeof this.snapshotState.lp === 'number') {
      return this.snapshotState.lp
    }
    const snap = await this.snapshot(['lp'] as const)
    if (snap.lp === undefined || snap.lp === null) {
      throw new TvError(`No price available for ${this.pair}`)
    }
    return snap.lp
  }

  /**
   * Resolve a typed snapshot for a specific subset of fields. Passing
   * no argument returns every field currently accumulated for this
   * symbol (type `FullQuoteSnapshot`).
   */
  snapshot<const F extends readonly QuoteField[]>(fields: F): Promise<QuoteSnapshot<F>>
  snapshot(): Promise<FullQuoteSnapshot>
  async snapshot(fields?: readonly QuoteField[]): Promise<FullQuoteSnapshot> {
    this.assertAlive()
    const targetFields = fields ?? DEFAULT_STREAM_FIELDS
    await this.ensureSubscribed(targetFields)
    await this.waitForLoad()

    if (!fields) {
      return { ...this.snapshotState } as FullQuoteSnapshot
    }
    const out: Record<string, unknown> = {}
    for (const f of fields) {
      if (this.snapshotState[f] !== undefined) {
        out[f] = this.snapshotState[f]
      }
    }
    return out as FullQuoteSnapshot
  }

  /** Fetch full symbol metadata via a one-shot chart session resolve. */
  async info(): Promise<SymbolInfo> {
    this.assertAlive()
    await this.client.manager.connect()

    const cs = new ChartSession({ manager: this.client.manager })
    try {
      const raw = await cs.resolvePair(this.pair)
      return symbolInfoFromRaw(raw)
    } finally {
      try {
        await cs.delete()
      } catch (err) {
        log('chart session delete failed: %s', (err as Error).message)
      }
    }
  }

  /** Fetch historical candles via a one-shot chart session. */
  async candles(opts: CandlesOptions): Promise<Candle[]> {
    this.assertAlive()
    if (opts.count <= 0) {
      throw new TvError('candles: count must be > 0')
    }
    await this.client.manager.connect()

    const cs = new ChartSession({ manager: this.client.manager })
    try {
      return await cs.fetchCandlesOnce(this.pair, {
        timeframe: opts.timeframe,
        barCount: opts.count,
      })
    } finally {
      try {
        await cs.delete()
      } catch (err) {
        log('chart session delete failed: %s', (err as Error).message)
      }
    }
  }

  /** Open a live quote stream for this symbol. */
  stream(fields: readonly QuoteField[] = DEFAULT_STREAM_FIELDS): Stream {
    this.assertAlive()
    const stream = new Stream(this, fields)
    this.streams.add(stream)
    void this.ensureSubscribed(fields).catch((err) => {
      stream._dispatchError(err as Error)
    })
    return stream
  }

  /** Current list of fields this symbol is subscribed to. */
  get subscribedFields(): readonly QuoteField[] {
    return Array.from(this.fields)
  }

  // ─── Internal API used by Client and Stream ─────────────────

  /** @internal */
  _onUpdate(update: QuoteUpdate): void {
    Object.assign(this.snapshotState, update.delta)
    for (const stream of this.streams) {
      stream._dispatch(update, this.snapshotState as FullQuoteSnapshot)
    }
  }

  /** @internal */
  _onComplete(): void {
    this.loaded = true
    const waiters = this.loadWaiters
    this.loadWaiters = []
    for (const w of waiters) w()
  }

  /** @internal */
  _onError(info: QuoteErrorInfo): void {
    const err = new TvSymbolError(info.symbol, info.message)
    for (const stream of this.streams) {
      stream._dispatchError(err)
    }
    const waiters = this.loadWaiters
    this.loadWaiters = []
    for (const w of waiters) w(err)
  }

  /** @internal */
  _removeStream(stream: Stream): void {
    this.streams.delete(stream)
  }

  /** @internal */
  _dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const stream of this.streams) {
      stream._closeFromSymbol()
    }
    this.streams.clear()
    const waiters = this.loadWaiters
    this.loadWaiters = []
    const err = new TvError(`TvSymbol ${this.pair} disposed`)
    for (const w of waiters) w(err)
  }

  // ─── private ────────────────────────────────────────────────

  private assertAlive(): void {
    if (this.disposed) {
      throw new TvError(`TvSymbol ${this.pair} has been disposed`)
    }
  }

  private async ensureSubscribed(fields: readonly QuoteField[]): Promise<void> {
    await this.client.manager.connect()

    const newFields: QuoteField[] = []
    for (const f of fields) {
      if (!this.fields.has(f)) {
        this.fields.add(f)
        newFields.push(f)
      }
    }

    if (newFields.length > 0) {
      this.client._requestFields(newFields)
    }

    if (!this.subscribed) {
      const pool = this.client._getQuotePool()
      pool.addSymbol(this.pair)
      this.subscribed = true
    }
  }

  private waitForLoad(): Promise<void> {
    if (this.loaded) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.loadWaiters.indexOf(waiter)
        if (idx >= 0) this.loadWaiters.splice(idx, 1)
        reject(new TvError(`Timeout waiting for ${this.pair} to load`))
      }, LOAD_TIMEOUT_MS)

      const waiter = (err?: Error): void => {
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }
      this.loadWaiters.push(waiter)
    })
  }
}
