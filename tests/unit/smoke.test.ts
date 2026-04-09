import { describe, expect, it } from 'vitest'
import { version } from '../../src/index.js'

describe('smoke', () => {
  it('exports version', () => {
    expect(version).toBe('2.0.0-dev')
  })

  it('internal module is importable', async () => {
    const mod = await import('../../src/internal.js')
    expect(mod).toBeDefined()
  })
})
