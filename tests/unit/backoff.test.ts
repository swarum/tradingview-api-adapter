import { describe, expect, it } from 'vitest'
import { calculateBackoff, DEFAULT_BACKOFF } from '../../src/utils/backoff.js'

describe('calculateBackoff', () => {
  // Deterministic random: returns 0.5 → jitter amount = 0 (midpoint of [-j, +j])
  const midRandom = (): number => 0.5

  it('throws on attempt < 1', () => {
    expect(() => calculateBackoff(0)).toThrow()
    expect(() => calculateBackoff(-1)).toThrow()
  })

  it('returns initial delay on first attempt with no jitter', () => {
    const d = calculateBackoff(1, { initialDelayMs: 100, jitter: 0 })
    expect(d).toBe(100)
  })

  it('doubles each attempt with factor 2 and no jitter', () => {
    const opts = { initialDelayMs: 100, maxDelayMs: 10_000, factor: 2, jitter: 0 }
    expect(calculateBackoff(1, opts)).toBe(100)
    expect(calculateBackoff(2, opts)).toBe(200)
    expect(calculateBackoff(3, opts)).toBe(400)
    expect(calculateBackoff(4, opts)).toBe(800)
    expect(calculateBackoff(5, opts)).toBe(1600)
  })

  it('clamps to maxDelayMs', () => {
    const opts = { initialDelayMs: 1000, maxDelayMs: 3000, factor: 2, jitter: 0 }
    expect(calculateBackoff(1, opts)).toBe(1000)
    expect(calculateBackoff(2, opts)).toBe(2000)
    expect(calculateBackoff(3, opts)).toBe(3000)
    expect(calculateBackoff(4, opts)).toBe(3000) // clamped
    expect(calculateBackoff(10, opts)).toBe(3000) // still clamped
  })

  it('applies symmetric jitter within expected bounds', () => {
    const opts = { initialDelayMs: 1000, jitter: 0.3 }
    // worst lower bound: random()=0 → -30% of 1000 = 700
    // worst upper bound: random()→1 → +30% of 1000 = 1300
    for (let i = 0; i < 1000; i++) {
      const d = calculateBackoff(1, opts)
      expect(d).toBeGreaterThanOrEqual(700)
      expect(d).toBeLessThanOrEqual(1300)
    }
  })

  it('produces zero jitter offset with midRandom', () => {
    const opts = { initialDelayMs: 1000, jitter: 0.3 }
    expect(calculateBackoff(1, opts, midRandom)).toBe(1000)
  })

  it('produces -jitter offset with random=0', () => {
    const opts = { initialDelayMs: 1000, jitter: 0.3 }
    expect(calculateBackoff(1, opts, () => 0)).toBe(700)
  })

  it('clamps jitter fraction to [0, 1]', () => {
    const d = calculateBackoff(1, { initialDelayMs: 1000, jitter: 5 }, () => 1)
    // jitter clamped to 1.0 → max upper bound is 2000
    expect(d).toBeLessThanOrEqual(2000)
  })

  it('never returns negative delay', () => {
    const opts = { initialDelayMs: 10, jitter: 1 }
    for (let i = 0; i < 1000; i++) {
      expect(calculateBackoff(1, opts)).toBeGreaterThanOrEqual(0)
    }
  })

  it('exposes defaults', () => {
    expect(DEFAULT_BACKOFF.initialDelayMs).toBe(100)
    expect(DEFAULT_BACKOFF.maxDelayMs).toBe(30_000)
    expect(DEFAULT_BACKOFF.factor).toBe(2)
    expect(DEFAULT_BACKOFF.jitter).toBe(0.3)
  })
})
