/**
 * MultiStream — a multi-symbol stream used by `Portfolio`, `Group`,
 * and `Client.stream()`.
 *
 * Internally, a `MultiStream` composes one single-symbol `Stream` per
 * participating `TvSymbol`. Updates from each child stream are
 * forwarded to the multi-stream's listeners with the `symbol` field
 * included on every event, so consumers can distinguish which pair
 * ticked.
 *
 * Dedup: because `Client.symbol(pair)` returns a pooled instance, two
 * groups that share a pair share the same child `TvSymbol`. When the
 * client-level aggregate stream iterates `symbolCache.values()`, each
 * pair appears exactly once, so listeners receive one event per tick
 * regardless of how many groups reference the pair.
 */

import { createLogger } from '../utils/logger.js'
import type { BarTick, FullQuoteSnapshot, QuoteField, TradeTick } from '../types/quote-fields.js'
import type { Stream } from './stream.js'
import type { TvSymbol } from './symbol.js'

const log = createLogger('multi-stream')

export interface MultiStreamEventMap {
  /** Fires on every quote delta, with the symbol and accumulated snapshot. */
  update: { symbol: string; data: FullQuoteSnapshot }
  /** Fires when `lp` changes, with the owning symbol. */
  price: { symbol: string; price: number }
  /** Fires when both `ch` and `chp` are present in the accumulated snapshot. */
  change: { symbol: string; value: number; percent: number }
  /** Fires when a new bar tick arrives. */
  bar: { symbol: string; bar: TradeTick | BarTick }
  /** Fires for per-symbol errors from any child stream. */
  error: Error
}

type MultiEventName = keyof MultiStreamEventMap
type Handler<E extends MultiEventName> = (data: MultiStreamEventMap[E]) => void

export interface MultiStreamOptions {
  /** Called when this MultiStream is closed (used by parent Group to untrack). */
  onClose?: () => void
}

export class MultiStream {
  private readonly children = new Map<string, Stream>()
  private readonly listeners: { [K in MultiEventName]: Set<Handler<K>> } = {
    update: new Set(),
    price: new Set(),
    change: new Set(),
    bar: new Set(),
    error: new Set(),
  }

  private closed = false
  private iteratorQueue: MultiStreamEventMap['update'][] = []
  private iteratorResolve: ((value: IteratorResult<MultiStreamEventMap['update']>) => void) | null =
    null

  constructor(
    symbols: Iterable<TvSymbol>,
    readonly fields: readonly QuoteField[],
    private readonly opts: MultiStreamOptions = {},
  ) {
    for (const sym of symbols) {
      this.attachSymbol(sym)
    }
  }

  /** Register a listener for a specific stream event. */
  on<E extends MultiEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].add(handler)
    return this
  }

  /** Remove a previously registered listener. */
  off<E extends MultiEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].delete(handler)
    return this
  }

  /** Close the stream, all of its child streams, and release resources. */
  close(): void {
    if (this.closed) return
    this.closed = true
    for (const child of this.children.values()) {
      child.close()
    }
    this.children.clear()
    for (const event of Object.keys(this.listeners) as MultiEventName[]) {
      this.listeners[event].clear()
    }
    this.flushIteratorOnClose()
    this.opts.onClose?.()
  }

  [Symbol.dispose](): void {
    this.close()
  }

  /**
   * Async iterator interface — yields `update` events across all
   * attached symbols. Breaking out of the `for await` loop closes the
   * stream automatically.
   */
  [Symbol.asyncIterator](): AsyncIterator<MultiStreamEventMap['update']> {
    return {
      next: (): Promise<IteratorResult<MultiStreamEventMap['update']>> => {
        if (this.closed && this.iteratorQueue.length === 0) {
          return Promise.resolve({ value: undefined as never, done: true })
        }
        const queued = this.iteratorQueue.shift()
        if (queued !== undefined) {
          return Promise.resolve({ value: queued, done: false })
        }
        return new Promise((resolve) => {
          this.iteratorResolve = resolve
        })
      },
      return: (): Promise<IteratorResult<MultiStreamEventMap['update']>> => {
        this.close()
        return Promise.resolve({ value: undefined as never, done: true })
      },
    }
  }

  /** Currently attached pairs. */
  get pairs(): readonly string[] {
    return Array.from(this.children.keys())
  }

  /** Number of currently attached child streams. */
  get size(): number {
    return this.children.size
  }

  /** Whether this multi-stream has been closed. */
  get isClosed(): boolean {
    return this.closed
  }

  // ─── Internal API used by Group to keep the stream in sync ──

  /** @internal */
  _attachSymbol(sym: TvSymbol): void {
    if (this.closed) return
    this.attachSymbol(sym)
  }

  /** @internal */
  _detachSymbol(pair: string): void {
    if (this.closed) return
    const child = this.children.get(pair)
    if (!child) return
    child.close()
    this.children.delete(pair)
  }

  // ─── private ────────────────────────────────────────────────

  private attachSymbol(sym: TvSymbol): void {
    if (this.children.has(sym.pair)) return
    const childStream = sym.stream(this.fields)
    this.children.set(sym.pair, childStream)

    childStream.on('update', (e) => {
      this.emit('update', e)
      this.pushToIterator(e)
    })
    childStream.on('price', (e) => {
      this.emit('price', { symbol: sym.pair, price: e.price })
    })
    childStream.on('change', (e) => {
      this.emit('change', { symbol: sym.pair, value: e.value, percent: e.percent })
    })
    childStream.on('bar', (e) => {
      this.emit('bar', { symbol: sym.pair, bar: e.bar })
    })
    childStream.on('error', (err) => {
      this.emit('error', err)
    })
  }

  private emit<E extends MultiEventName>(event: E, data: MultiStreamEventMap[E]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(data)
      } catch (err) {
        log('listener for %s threw: %s', event, (err as Error).message)
      }
    }
  }

  private pushToIterator(event: MultiStreamEventMap['update']): void {
    if (this.iteratorResolve) {
      const resolve = this.iteratorResolve
      this.iteratorResolve = null
      resolve({ value: event, done: false })
    } else {
      this.iteratorQueue.push(event)
    }
  }

  private flushIteratorOnClose(): void {
    if (this.iteratorResolve) {
      const resolve = this.iteratorResolve
      this.iteratorResolve = null
      resolve({ value: undefined as never, done: true })
    }
  }
}
