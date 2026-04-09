/**
 * Exponential backoff with jitter.
 *
 * delay(attempt) = min(initial * factor^(attempt-1), max) + jitter
 *
 * `jitter` is a fraction in [0, 1] applied symmetrically: a value of 0.3
 * means the final delay is the base delay ± up to 30%.
 *
 * The random source can be overridden for deterministic tests.
 */

export interface BackoffOptions {
  /** First attempt delay, in milliseconds. Default: 100. */
  initialDelayMs?: number
  /** Upper bound for any single delay, in milliseconds. Default: 30_000. */
  maxDelayMs?: number
  /** Multiplier applied to each subsequent attempt. Default: 2. */
  factor?: number
  /** Jitter fraction in [0, 1]. Default: 0.3. */
  jitter?: number
}

export const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  initialDelayMs: 100,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: 0.3,
}

export function calculateBackoff(
  attempt: number,
  opts: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  if (attempt < 1) throw new Error(`attempt must be >= 1, got ${attempt}`)

  const initial = opts.initialDelayMs ?? DEFAULT_BACKOFF.initialDelayMs
  const max = opts.maxDelayMs ?? DEFAULT_BACKOFF.maxDelayMs
  const factor = opts.factor ?? DEFAULT_BACKOFF.factor
  const jitter = clamp(opts.jitter ?? DEFAULT_BACKOFF.jitter, 0, 1)

  const base = Math.min(initial * Math.pow(factor, attempt - 1), max)
  // random() in [0, 1) → map to [-1, 1)
  const jitterAmount = base * jitter * (random() * 2 - 1)
  return Math.max(0, Math.round(base + jitterAmount))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
