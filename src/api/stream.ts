/**
 * Stream — typed event emitter returned by `TvSymbol.stream()`.
 *
 * A `Stream` is a thin wrapper around a `TvSymbol`'s ongoing quote
 * subscription. It exposes strongly-typed events and a closable
 * lifecycle, plus an `AsyncIterator` interface so you can consume
 * updates with `for await`.
 *
 * All event handlers receive a single object argument (never positional
 * arguments) so adding new fields in the future is a non-breaking
 * change.
 */

import { createLogger } from '../utils/logger.js'
import type { QuoteUpdate } from '../sessions/session.types.js'
import type { BarTick, FullQuoteSnapshot, QuoteField, TradeTick } from '../types/quote-fields.js'
import type { TvSymbol } from './symbol.js'

const log = createLogger('stream')

export interface StreamEventMap {
  /** Fires on every quote delta. `data` is the full accumulated snapshot. */
  update: { symbol: string; data: FullQuoteSnapshot }
  /** Fires whenever the last traded price (`lp`) changes. */
  price: { price: number }
  /** Fires whenever `ch`/`chp` change (both present in the accumulated snapshot). */
  change: { value: number; percent: number }
  /** Fires when a new bar arrives (`trade`, `minute-bar`, or `daily-bar`). */
  bar: { bar: TradeTick | BarTick }
  /** Fires on per-symbol errors reported by TradingView. */
  error: Error
}

type StreamEventName = keyof StreamEventMap
type Handler<E extends StreamEventName> = (data: StreamEventMap[E]) => void

export class Stream {
  private readonly listeners: { [K in StreamEventName]: Set<Handler<K>> } = {
    update: new Set(),
    price: new Set(),
    change: new Set(),
    bar: new Set(),
    error: new Set(),
  }

  private closed = false
  private iteratorQueue: StreamEventMap['update'][] = []
  private iteratorResolve: ((value: IteratorResult<StreamEventMap['update']>) => void) | null = null

  constructor(
    readonly tvSymbol: TvSymbol,
    /** Fields this stream was opened with. Currently informational only. */
    readonly fields: readonly QuoteField[],
  ) {}

  /** Register a listener for a specific stream event. */
  on<E extends StreamEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].add(handler)
    return this
  }

  /** Remove a previously registered listener. */
  off<E extends StreamEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].delete(handler)
    return this
  }

  /** Close the stream and release its resources. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.tvSymbol._removeStream(this)
    for (const event of Object.keys(this.listeners) as StreamEventName[]) {
      this.listeners[event].clear()
    }
    this.flushIteratorOnClose()
  }

  [Symbol.dispose](): void {
    this.close()
  }

  /**
   * Async iterator interface — iterate over `update` events with
   * `for await`. Breaking out of the loop automatically closes the
   * stream.
   */
  [Symbol.asyncIterator](): AsyncIterator<StreamEventMap['update']> {
    return {
      next: (): Promise<IteratorResult<StreamEventMap['update']>> => {
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
      return: (): Promise<IteratorResult<StreamEventMap['update']>> => {
        this.close()
        return Promise.resolve({ value: undefined as never, done: true })
      },
    }
  }

  // ─── Internal dispatch API (called by TvSymbol) ─────────────

  /** @internal */
  _dispatch(u: QuoteUpdate, snapshot: FullQuoteSnapshot): void {
    if (this.closed) return

    // Shallow-copy the snapshot so historical update events are not
    // mutated when subsequent deltas modify the parent snapshotState.
    // Listeners can safely hold references across events.
    const updateEvent: StreamEventMap['update'] = {
      symbol: u.symbol,
      data: { ...snapshot },
    }
    this.emit('update', updateEvent)
    this.pushToIterator(updateEvent)

    const delta = u.delta as Record<string, unknown>

    if ('lp' in delta && typeof delta.lp === 'number') {
      this.emit('price', { price: delta.lp })
    }

    if ('ch' in delta || 'chp' in delta) {
      const snap = snapshot as Record<string, unknown>
      if (typeof snap.ch === 'number' && typeof snap.chp === 'number') {
        this.emit('change', { value: snap.ch, percent: snap.chp })
      }
    }

    if ('minute-bar' in delta) {
      this.emit('bar', { bar: delta['minute-bar'] as BarTick })
    } else if ('daily-bar' in delta) {
      this.emit('bar', { bar: delta['daily-bar'] as BarTick })
    } else if ('trade' in delta) {
      this.emit('bar', { bar: delta.trade as TradeTick })
    }
  }

  /** @internal */
  _dispatchError(err: Error): void {
    if (this.closed) return
    this.emit('error', err)
  }

  /** @internal — used by TvSymbol when the parent client shuts down. */
  _closeFromSymbol(): void {
    if (this.closed) return
    this.closed = true
    for (const event of Object.keys(this.listeners) as StreamEventName[]) {
      this.listeners[event].clear()
    }
    this.flushIteratorOnClose()
  }

  // ─── private ────────────────────────────────────────────────

  private emit<E extends StreamEventName>(event: E, data: StreamEventMap[E]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(data)
      } catch (err) {
        log('listener for %s threw: %s', event, (err as Error).message)
      }
    }
  }

  private pushToIterator(event: StreamEventMap['update']): void {
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
