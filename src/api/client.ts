/**
 * Client — the public entry point for the library.
 *
 * A `Client` owns a `SessionManager` (and therefore a `Transport`) and
 * acts as a registry/pool for `TvSymbol` instances. It also lazily
 * creates a single shared `QuoteSession` that carries every symbol's
 * live subscription, so one open TradingView session services an
 * entire portfolio.
 *
 * Create one via the `tv(options)` factory — a simple function call is
 * more idiomatic than `new Client()` and keeps the public surface tiny.
 */

import { createLogger } from '../utils/logger.js'
import { SessionManager } from '../core/session-manager.js'
import type { RateLimitOptions } from '../core/rate-limiter.types.js'
import type { ReconnectOptions } from '../core/transport.types.js'
import { QuoteSession } from '../sessions/quote-session.js'
import type { QuoteErrorInfo, QuoteUpdate } from '../sessions/session.types.js'
import type { QuoteField } from '../types/quote-fields.js'
import { TvError } from '../core/errors.js'
import { DEFAULT_STREAM_FIELDS, TvSymbol } from './symbol.js'
import { Portfolio } from './portfolio.js'
import type { Group } from './group.js'
import { GroupRegistry } from './group-registry.js'
import { MultiStream } from './multi-stream.js'

const log = createLogger('client')

export interface ClientOptions {
  /** WebSocket URL. Defaults to TradingView widget endpoint. */
  url?: string
  /** Origin header (Node only). Defaults to the TradingView origin. */
  origin?: string
  /** HTTP/SOCKS agent for proxy support (Node only). */
  agent?: unknown
  /** Reconnect behaviour for the underlying transport. */
  reconnect?: ReconnectOptions
  /** Symbol add/remove rate limiting. */
  rateLimit?: RateLimitOptions
  /** Abort signal — disconnects the client when fired. */
  signal?: AbortSignal
}

export interface ClientEventMap {
  open: void
  close: void
  reconnect: { attempt: number; delayMs: number }
  error: Error
}

type ClientEventName = keyof ClientEventMap
type Handler<E extends ClientEventName> = (data: ClientEventMap[E]) => void

/**
 * Factory: `tv(options)` → `Client`.
 *
 * Idiomatic entry point. Equivalent to `new Client(options)`.
 */
export function tv(options: ClientOptions = {}): Client {
  return new Client(options)
}

export class Client {
  readonly manager: SessionManager
  readonly groups: GroupRegistry

  private quotePool: QuoteSession | null = null
  private readonly symbolCache = new Map<string, TvSymbol>()
  private readonly aggregatedFields = new Set<QuoteField>()
  private readonly listeners: { [K in ClientEventName]: Set<Handler<K>> } = {
    open: new Set(),
    close: new Set(),
    reconnect: new Set(),
    error: new Set(),
  }
  private disposed = false

  constructor(opts: ClientOptions = {}) {
    this.manager = new SessionManager({
      url: opts.url,
      origin: opts.origin,
      agent: opts.agent,
      reconnect: opts.reconnect,
      rateLimit: opts.rateLimit,
      signal: opts.signal,
    })
    this.groups = new GroupRegistry(this)
  }

  /**
   * Get the `TvSymbol` handle for a market pair. Repeated calls for
   * the same pair return the same instance, so subscriptions pool
   * naturally across callers.
   */
  symbol(pair: string): TvSymbol {
    if (this.disposed) throw new TvError('Client has been disposed')
    let s = this.symbolCache.get(pair)
    if (!s) {
      s = new TvSymbol(this, pair)
      this.symbolCache.set(pair, s)
    }
    return s
  }

  /**
   * Build an ad-hoc `Portfolio` over the given pairs. Unlike
   * `createGroup`, a portfolio is not tracked by the client — it only
   * lives as long as the caller holds the reference.
   */
  symbols(pairs: readonly string[]): Portfolio {
    if (this.disposed) throw new TvError('Client has been disposed')
    return new Portfolio(this, pairs)
  }

  /**
   * Create a named `Group` and register it with `client.groups`. Use
   * groups for long-lived, mutable collections — e.g. a watchlist the
   * user can edit at runtime.
   */
  createGroup(name: string, pairs: readonly string[] = []): Group {
    if (this.disposed) throw new TvError('Client has been disposed')
    return this.groups.create(name, pairs)
  }

  /**
   * Aggregate multi-symbol stream across every symbol currently
   * registered on this client. De-duplicates naturally: a pair that
   * belongs to multiple groups appears once in the client's symbol
   * cache, so listeners receive one event per tick regardless of how
   * many groups reference it.
   */
  stream(fields: readonly QuoteField[] = DEFAULT_STREAM_FIELDS): MultiStream {
    if (this.disposed) throw new TvError('Client has been disposed')
    return new MultiStream(this.symbolCache.values(), fields)
  }

  /** Open the underlying transport and wait until TradingView is ready. */
  async connect(): Promise<void> {
    if (this.disposed) throw new TvError('Client has been disposed')
    await this.manager.connect()
    this.emit('open', undefined)
  }

  /** Close everything: groups, pool session, all symbols, transport. */
  async disconnect(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    log('disconnect: %d cached symbols, %d groups', this.symbolCache.size, this.groups.size)

    await this.groups._disposeAll()

    for (const s of this.symbolCache.values()) {
      s._dispose()
    }
    this.symbolCache.clear()

    if (this.quotePool) {
      try {
        await this.quotePool.delete()
      } catch (err) {
        log('quote pool delete failed: %s', (err as Error).message)
      }
      this.quotePool = null
    }

    await this.manager.disconnect()
    this.emit('close', undefined)
  }

  /** Register a client-level event listener. */
  on<E extends ClientEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].add(handler)
    return this
  }

  /** Remove a previously registered event listener. */
  off<E extends ClientEventName>(event: E, handler: Handler<E>): this {
    this.listeners[event].delete(handler)
    return this
  }

  /** Async disposer support (`using client = tv()`). */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.disconnect()
  }

  // ─── Internal API used by TvSymbol / Stream ─────────────────

  /** @internal */
  _getQuotePool(): QuoteSession {
    if (this.quotePool) return this.quotePool
    this.quotePool = new QuoteSession({
      manager: this.manager,
      onUpdate: (u) => this.dispatchUpdate(u),
      onError: (e) => this.dispatchError(e),
      onComplete: (pair) => this.dispatchComplete(pair),
    })
    // Push any previously-aggregated fields into the pool so symbols
    // that registered fields before the pool existed are covered.
    if (this.aggregatedFields.size > 0) {
      this.quotePool.setFields([...this.aggregatedFields])
    }
    return this.quotePool
  }

  /** @internal */
  _requestFields(fields: readonly QuoteField[]): void {
    if (fields.length === 0) return
    let changed = false
    for (const f of fields) {
      if (!this.aggregatedFields.has(f)) {
        this.aggregatedFields.add(f)
        changed = true
      }
    }
    if (changed && this.quotePool) {
      this.quotePool.setFields([...this.aggregatedFields])
    }
  }

  /** @internal — exposed primarily for tests and advanced users. */
  _getSymbolCache(): ReadonlyMap<string, TvSymbol> {
    return this.symbolCache
  }

  // ─── private ────────────────────────────────────────────────

  private dispatchUpdate(u: QuoteUpdate): void {
    const s = this.symbolCache.get(u.symbol)
    if (s) s._onUpdate(u)
  }

  private dispatchError(e: QuoteErrorInfo): void {
    const s = this.symbolCache.get(e.symbol)
    if (s) s._onError(e)
  }

  private dispatchComplete(pair: string): void {
    const s = this.symbolCache.get(pair)
    if (s) s._onComplete()
  }

  private emit<E extends ClientEventName>(event: E, data: ClientEventMap[E]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(data)
      } catch (err) {
        log('listener for %s threw: %s', event, (err as Error).message)
      }
    }
  }
}
