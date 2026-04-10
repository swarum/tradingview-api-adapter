/**
 * Types for the client-side rate limiter.
 *
 * The limiter is responsible for:
 *   - **Micro-batching**: collect calls made inside a short window and
 *     flush them as a single list, so a loop doing `add('A'); add('B')`
 *     becomes one network command.
 *   - **Chunking**: split very large flushes into fixed-size chunks and
 *     dispatch them with an interval, to avoid flooding TradingView in
 *     cases where the caller enqueues hundreds of symbols at once.
 *   - **Deduplication**: `add('X')` called twice inside the window
 *     becomes one add. Calling `add('X'); remove('X')` inside the window
 *     cancels out and produces nothing at all.
 */

export interface RateLimitOptions {
  /**
   * Collect operations for this many milliseconds before flushing.
   * A shorter window means less batching but lower latency.
   * Default: 50.
   */
  batchWindowMs?: number

  /**
   * Maximum symbols per dispatched chunk. Flushes larger than this are
   * split across multiple chunks with `chunkIntervalMs` between them.
   * Default: 50.
   */
  chunkSize?: number

  /**
   * Delay between consecutive chunks within a single flush.
   * Only applies when a flush exceeds `chunkSize` symbols.
   * Default: 100.
   */
  chunkIntervalMs?: number
}

export const DEFAULT_RATE_LIMIT: Required<RateLimitOptions> = {
  batchWindowMs: 50,
  chunkSize: 50,
  chunkIntervalMs: 100,
}

export function resolveRateLimit(opts: RateLimitOptions = {}): Required<RateLimitOptions> {
  return {
    batchWindowMs: opts.batchWindowMs ?? DEFAULT_RATE_LIMIT.batchWindowMs,
    chunkSize: opts.chunkSize ?? DEFAULT_RATE_LIMIT.chunkSize,
    chunkIntervalMs: opts.chunkIntervalMs ?? DEFAULT_RATE_LIMIT.chunkIntervalMs,
  }
}

export interface SymbolBatcherExecutor {
  /** Called with a chunk of symbols to add. */
  add: (symbols: string[]) => void
  /** Called with a chunk of symbols to remove. */
  remove: (symbols: string[]) => void
}
