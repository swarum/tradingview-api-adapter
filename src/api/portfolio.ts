/**
 * Portfolio — a lightweight, ad-hoc collection of symbols.
 *
 * Created via `client.symbols([...])`. Unlike `Group`, a portfolio is
 * immutable: the pairs you pass at construction are the only pairs it
 * tracks. Use it for quick, one-off queries ("what are the prices of
 * these 5 tickers right now?") or short-lived streaming sessions.
 *
 * For long-lived, mutable collections with a name, use `Group`.
 */

import { DEFAULT_STREAM_FIELDS } from './symbol.js'
import type { TvSymbol } from './symbol.js'
import type { Client } from './client.js'
import type { FullQuoteSnapshot, QuoteField, QuoteSnapshot } from '../types/quote-fields.js'
import { MultiStream } from './multi-stream.js'

export class Portfolio {
  readonly tvSymbols: readonly TvSymbol[]

  constructor(
    readonly client: Client,
    pairs: readonly string[],
  ) {
    this.tvSymbols = pairs.map((p) => client.symbol(p))
  }

  /** Pairs currently tracked (order preserved from construction). */
  get pairs(): readonly string[] {
    return this.tvSymbols.map((s) => s.pair)
  }

  /** Number of symbols in the portfolio. */
  get size(): number {
    return this.tvSymbols.length
  }

  /** Last prices keyed by pair. Missing prices are omitted. */
  async prices(): Promise<Record<string, number>> {
    const results = await Promise.all(
      this.tvSymbols.map(async (s) => {
        try {
          return [s.pair, await s.price()] as const
        } catch {
          return [s.pair, undefined] as const
        }
      }),
    )
    const out: Record<string, number> = {}
    for (const [pair, price] of results) {
      if (typeof price === 'number') out[pair] = price
    }
    return out
  }

  /** Typed snapshots keyed by pair. */
  snapshot<const F extends readonly QuoteField[]>(
    fields: F,
  ): Promise<Record<string, QuoteSnapshot<F>>>
  snapshot(): Promise<Record<string, FullQuoteSnapshot>>
  async snapshot(fields?: readonly QuoteField[]): Promise<Record<string, FullQuoteSnapshot>> {
    const snaps = await Promise.all(
      this.tvSymbols.map(async (s) => {
        try {
          const data = fields ? await s.snapshot(fields) : await s.snapshot()
          return [s.pair, data] as const
        } catch {
          return [s.pair, null] as const
        }
      }),
    )
    const out: Record<string, FullQuoteSnapshot> = {}
    for (const [pair, data] of snaps) {
      if (data !== null) out[pair] = data as FullQuoteSnapshot
    }
    return out
  }

  /** Open a multi-symbol live stream over every pair in the portfolio. */
  stream(fields: readonly QuoteField[] = DEFAULT_STREAM_FIELDS): MultiStream {
    return new MultiStream(this.tvSymbols, fields)
  }
}
