/**
 * QuoteSession — manages a TradingView `quote_create_session` container.
 *
 * Responsibilities:
 *   - Send `quote_create_session` / `quote_set_fields` / `quote_add_symbols`
 *     / `quote_remove_symbols` / `quote_delete_session`
 *   - Accumulate per-symbol state across deltas
 *   - Emit typed events via callbacks
 *   - Re-register on reconnect via `replay()`
 *   - Apply rate limiting to add/remove calls through `SymbolBatcher`
 */

import { SymbolBatcher } from '../core/rate-limiter.js'
import type { RateLimitOptions } from '../core/rate-limiter.types.js'
import type { SessionManager } from '../core/session-manager.js'
import { createLogger } from '../utils/logger.js'
import { randomId } from '../utils/random-id.js'
import type { QuoteErrorInfo, QuoteUpdate, Session } from './session.types.js'

const log = createLogger('session:quote')

export interface QuoteSessionOptions {
  manager: SessionManager
  /** Override the manager-level rate limit for this session. */
  rateLimit?: RateLimitOptions
  /** Called for every quote delta received on this session. */
  onUpdate?: (update: QuoteUpdate) => void
  /** Called when TradingView returns a per-symbol error. */
  onError?: (err: QuoteErrorInfo) => void
  /** Called when the initial snapshot for a symbol has fully loaded. */
  onComplete?: (symbol: string) => void
}

export class QuoteSession implements Session {
  readonly id: string
  private readonly manager: SessionManager
  private readonly batcher: SymbolBatcher
  private readonly state = new Map<string, Record<string, unknown>>()
  private readonly fields = new Set<string>()
  private readonly subscribedSymbols = new Set<string>()
  private readonly loadedSymbols = new Set<string>()
  private disposed = false
  private created = false

  private readonly onUpdateCb?: (update: QuoteUpdate) => void
  private readonly onErrorCb?: (err: QuoteErrorInfo) => void
  private readonly onCompleteCb?: (symbol: string) => void

  constructor(opts: QuoteSessionOptions) {
    this.id = `qs_${randomId(12)}`
    this.manager = opts.manager
    this.onUpdateCb = opts.onUpdate
    this.onErrorCb = opts.onError
    this.onCompleteCb = opts.onComplete

    this.batcher = new SymbolBatcher(
      {
        add: (symbols) => this.manager.sendCommand('quote_add_symbols', [this.id, ...symbols]),
        remove: (symbols) =>
          this.manager.sendCommand('quote_remove_symbols', [this.id, ...symbols]),
      },
      opts.rateLimit ?? opts.manager.rateLimit,
    )

    this.manager.registerSession(this)
    this.sendCreate()
  }

  /** Replace the active field set and push the update to TradingView. */
  setFields(fields: readonly string[]): void {
    if (this.disposed) return
    this.fields.clear()
    for (const f of fields) this.fields.add(f)
    if (this.created) {
      this.manager.sendCommand('quote_set_fields', [this.id, ...this.fields])
    }
  }

  /** Queue one symbol for addition. */
  addSymbol(symbol: string): void {
    if (this.disposed || !symbol) return
    if (this.subscribedSymbols.has(symbol)) return
    this.subscribedSymbols.add(symbol)
    this.batcher.add(symbol)
  }

  /** Queue multiple symbols for addition. */
  addSymbols(symbols: Iterable<string>): void {
    for (const s of symbols) this.addSymbol(s)
  }

  /** Queue one symbol for removal. */
  removeSymbol(symbol: string): void {
    if (this.disposed || !symbol) return
    if (!this.subscribedSymbols.delete(symbol)) return
    this.loadedSymbols.delete(symbol)
    this.state.delete(symbol)
    this.batcher.remove(symbol)
  }

  /** Queue multiple symbols for removal. */
  removeSymbols(symbols: Iterable<string>): void {
    for (const s of symbols) this.removeSymbol(s)
  }

  /** All symbols currently subscribed on this session (local view). */
  getSubscribedSymbols(): readonly string[] {
    return Array.from(this.subscribedSymbols)
  }

  /** Accumulated quote state for a symbol, if any. */
  getSnapshot(symbol: string): Readonly<Record<string, unknown>> | undefined {
    return this.state.get(symbol)
  }

  /** Force-flush any pending add/remove operations. */
  async flushPending(): Promise<void> {
    await this.batcher.flushNow()
  }

  /**
   * Delete the server-side session and release local resources.
   * Safe to call more than once.
   */
  async delete(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    try {
      await this.batcher.flushNow()
    } catch {
      /* ignore flush errors during teardown */
    }
    this.batcher.destroy()
    if (this.created) {
      this.manager.sendCommand('quote_delete_session', [this.id])
    }
    this.manager.unregisterSession(this.id)
    this.state.clear()
    this.subscribedSymbols.clear()
    this.loadedSymbols.clear()
  }

  // ─── Session interface ─────────────────────────────────────

  handleMessage(method: string, params: unknown[]): void {
    switch (method) {
      case 'qsd':
        this.handleQsd(params)
        break
      case 'quote_completed':
        this.handleQuoteCompleted(params)
        break
      default:
        log('ignoring unknown method %s', method)
    }
  }

  handleDisconnect(): void {
    // Keep subscribedSymbols + fields so replay() can restore them.
    // But the server's view of "loaded" is gone, so next deltas should
    // look like a fresh initial load.
    this.loadedSymbols.clear()
    this.created = false
  }

  replay(): void {
    if (this.disposed) return
    log('replay %s: %d symbols', this.id, this.subscribedSymbols.size)
    this.sendCreate()
    if (this.fields.size > 0) {
      this.manager.sendCommand('quote_set_fields', [this.id, ...this.fields])
    }
    if (this.subscribedSymbols.size > 0) {
      // Bypass the batcher on replay — we need deterministic ordering.
      this.manager.sendCommand('quote_add_symbols', [this.id, ...this.subscribedSymbols])
    }
  }

  // ─── private ───────────────────────────────────────────────

  private sendCreate(): void {
    this.manager.sendCommand('quote_create_session', [this.id])
    this.created = true
  }

  private handleQsd(params: unknown[]): void {
    const payload = params[1]
    if (!isQsdPayload(payload)) return

    if (payload.s === 'error') {
      this.onErrorCb?.({
        symbol: payload.n,
        message: typeof payload.errmsg === 'string' ? payload.errmsg : 'Unknown error',
      })
      return
    }

    const prev = this.state.get(payload.n) ?? {}
    const snapshot = { ...prev, ...payload.v }
    this.state.set(payload.n, snapshot)

    const isFirstLoad = !this.loadedSymbols.has(payload.n)

    this.onUpdateCb?.({
      symbol: payload.n,
      delta: payload.v,
      snapshot,
      isFirstLoad,
    })
  }

  private handleQuoteCompleted(params: unknown[]): void {
    const symbol = params[1]
    if (typeof symbol !== 'string') return
    this.loadedSymbols.add(symbol)
    this.onCompleteCb?.(symbol)
  }
}

interface QsdPayload {
  n: string
  s: 'ok' | 'error'
  v: Record<string, unknown>
  errmsg?: string
}

function isQsdPayload(p: unknown): p is QsdPayload {
  if (typeof p !== 'object' || p === null) return false
  const obj = p as Record<string, unknown>
  return (
    typeof obj.n === 'string' &&
    (obj.s === 'ok' || obj.s === 'error') &&
    typeof obj.v === 'object' &&
    obj.v !== null
  )
}
