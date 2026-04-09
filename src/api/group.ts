/**
 * Group — a named, mutable collection of symbols.
 *
 * Unlike `Portfolio`, a `Group` is long-lived: it has a name, is
 * tracked by the parent `Client` via `GroupRegistry`, and supports
 * mutation (`add`, `remove`, `clear`). Active streams stay in sync
 * with the group: adding a pair attaches a child stream, removing a
 * pair detaches it.
 *
 * Lifecycle:
 *   const crypto = client.createGroup('crypto', ['BINANCE:BTCUSDT'])
 *   crypto.add('BINANCE:ETHUSDT')
 *   const stream = crypto.stream()
 *   crypto.add('BINANCE:DOGEUSDT')     // ← joins the active stream
 *   crypto.remove('BINANCE:BTCUSDT')    // ← detaches from the active stream
 *   await crypto.delete()               // ← close all streams, remove from registry
 */

import { TvError } from '../core/errors.js'
import { DEFAULT_STREAM_FIELDS } from './symbol.js'
import type { TvSymbol } from './symbol.js'
import type { Client } from './client.js'
import type { FullQuoteSnapshot, QuoteField, QuoteSnapshot } from '../types/quote-fields.js'
import { MultiStream } from './multi-stream.js'

export class Group {
  private readonly members = new Map<string, TvSymbol>()
  private readonly activeStreams = new Set<MultiStream>()
  private disposed = false

  constructor(
    readonly client: Client,
    readonly name: string,
    pairs: readonly string[],
  ) {
    for (const pair of pairs) {
      this.members.set(pair, client.symbol(pair))
    }
  }

  /** Symbols currently in the group. */
  get pairs(): readonly string[] {
    return Array.from(this.members.keys())
  }

  /** Live `TvSymbol` handles for every pair. */
  get tvSymbols(): readonly TvSymbol[] {
    return Array.from(this.members.values())
  }

  /** Number of pairs in the group. */
  get size(): number {
    return this.members.size
  }

  /** Whether a specific pair is in the group. */
  has(pair: string): boolean {
    return this.members.has(pair)
  }

  /** Add a pair. Active streams automatically pick it up. Returns `this` for chaining. */
  add(pair: string): this {
    this.assertAlive()
    if (this.members.has(pair)) return this
    const sym = this.client.symbol(pair)
    this.members.set(pair, sym)
    for (const stream of this.activeStreams) {
      stream._attachSymbol(sym)
    }
    return this
  }

  /** Add many pairs at once. */
  addAll(pairs: Iterable<string>): this {
    for (const p of pairs) this.add(p)
    return this
  }

  /** Remove a pair. Returns `true` if it was present. */
  remove(pair: string): boolean {
    this.assertAlive()
    if (!this.members.delete(pair)) return false
    for (const stream of this.activeStreams) {
      stream._detachSymbol(pair)
    }
    return true
  }

  /** Remove many pairs at once. Returns the count of removed pairs. */
  removeAll(pairs: Iterable<string>): number {
    let n = 0
    for (const p of pairs) {
      if (this.remove(p)) n++
    }
    return n
  }

  /** Remove every pair. */
  clear(): this {
    this.assertAlive()
    const all = Array.from(this.members.keys())
    for (const p of all) this.remove(p)
    return this
  }

  /** Last prices keyed by pair. Missing prices are omitted. */
  async prices(): Promise<Record<string, number>> {
    this.assertAlive()
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
    this.assertAlive()
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

  /** Open a multi-symbol live stream that stays in sync with the group. */
  stream(fields: readonly QuoteField[] = DEFAULT_STREAM_FIELDS): MultiStream {
    this.assertAlive()
    const stream = new MultiStream(this.tvSymbols, fields, {
      onClose: () => {
        this.activeStreams.delete(stream)
      },
    })
    this.activeStreams.add(stream)
    return stream
  }

  /**
   * Delete the group: close every active stream and remove it from the
   * parent client's group registry.
   */
  async delete(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const stream of this.activeStreams) stream.close()
    this.activeStreams.clear()
    this.members.clear()
    this.client.groups._unregister(this.name)
  }

  // ─── private ────────────────────────────────────────────────

  private assertAlive(): void {
    if (this.disposed) {
      throw new TvError(`Group "${this.name}" has been deleted`)
    }
  }
}
