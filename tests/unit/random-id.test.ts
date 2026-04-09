import { describe, expect, it } from 'vitest'
import { randomId } from '../../src/utils/random-id.js'

describe('randomId', () => {
  it('returns a string of the requested length', () => {
    expect(randomId(1)).toHaveLength(1)
    expect(randomId(12)).toHaveLength(12)
    expect(randomId(64)).toHaveLength(64)
  })

  it('defaults to length 12', () => {
    expect(randomId()).toHaveLength(12)
  })

  it('contains only alphanumeric characters', () => {
    const id = randomId(100)
    expect(id).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('produces different values across calls (statistical)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(randomId(12))
    // collisions in 62^12 space are astronomically unlikely
    expect(seen.size).toBe(1000)
  })

  it('is deterministic with an injected random source', () => {
    const fixed = (): number => 0
    expect(randomId(5, fixed)).toBe('AAAAA')
  })
})
