/**
 * SymbolBatcher — batching + chunking + dedup for quote add/remove ops.
 *
 * See `rate-limiter.types.ts` for a description of the semantics.
 */

import { createLogger } from '../utils/logger.js'
import {
  type RateLimitOptions,
  resolveRateLimit,
  type SymbolBatcherExecutor,
} from './rate-limiter.types.js'

const log = createLogger('rate-limiter')

export class SymbolBatcher {
  private readonly opts: Required<RateLimitOptions>
  private pendingAdd = new Set<string>()
  private pendingRemove = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private disposed = false

  constructor(
    private readonly executor: SymbolBatcherExecutor,
    opts: RateLimitOptions = {},
  ) {
    this.opts = resolveRateLimit(opts)
  }

  /**
   * Queue a symbol for addition. If the same symbol has a pending
   * removal in the current window, the two cancel out and nothing is
   * dispatched.
   */
  add(symbol: string): void {
    if (this.disposed) return
    if (this.pendingRemove.delete(symbol)) {
      log('cancel: add(%s) cancelled pending remove', symbol)
      return
    }
    this.pendingAdd.add(symbol)
    this.scheduleFlush()
  }

  /**
   * Queue a symbol for removal. If the same symbol has a pending
   * addition in the current window, the two cancel out and nothing is
   * dispatched.
   */
  remove(symbol: string): void {
    if (this.disposed) return
    if (this.pendingAdd.delete(symbol)) {
      log('cancel: remove(%s) cancelled pending add', symbol)
      return
    }
    this.pendingRemove.add(symbol)
    this.scheduleFlush()
  }

  /** Number of pending operations (both adds and removes). */
  get pendingCount(): number {
    return this.pendingAdd.size + this.pendingRemove.size
  }

  /**
   * Force an immediate flush of any pending operations, bypassing the
   * batch window timer. Resolves once all resulting chunks have been
   * dispatched through the executor.
   */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  /**
   * Destroy the batcher. Any pending operations are dropped — the
   * caller is responsible for calling `flushNow()` first if that's
   * undesired.
   */
  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingAdd.clear()
    this.pendingRemove.clear()
  }

  // ─── private ────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer || this.disposed) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, this.opts.batchWindowMs)
  }

  private async flush(): Promise<void> {
    if (this.inFlight) {
      // A flush is already in progress. Wait for it, then re-check in
      // case more ops were enqueued in the meantime.
      await this.inFlight
      if (!this.disposed && (this.pendingAdd.size > 0 || this.pendingRemove.size > 0)) {
        return this.flush()
      }
      return
    }

    const adds = Array.from(this.pendingAdd)
    const removes = Array.from(this.pendingRemove)
    this.pendingAdd.clear()
    this.pendingRemove.clear()

    if (adds.length === 0 && removes.length === 0) return

    log('flush: add=%d remove=%d', adds.length, removes.length)

    this.inFlight = (async () => {
      try {
        await this.dispatchChunks(adds, (chunk) => this.executor.add(chunk))
        await this.dispatchChunks(removes, (chunk) => this.executor.remove(chunk))
      } finally {
        this.inFlight = null
      }
    })()
    return this.inFlight
  }

  private async dispatchChunks(items: string[], send: (chunk: string[]) => void): Promise<void> {
    if (items.length === 0) return
    const { chunkSize, chunkIntervalMs } = this.opts
    for (let i = 0; i < items.length; i += chunkSize) {
      if (this.disposed) return
      const chunk = items.slice(i, i + chunkSize)
      send(chunk)
      if (i + chunkSize < items.length) {
        await sleep(chunkIntervalMs)
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
