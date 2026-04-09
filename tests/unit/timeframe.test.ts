import { describe, expect, it } from 'vitest'
import { TvError } from '../../src/core/errors.js'
import { normalizeTimeframe, TIMEFRAME_ALIASES, type Timeframe } from '../../src/types/candle.js'

describe('normalizeTimeframe', () => {
  describe('raw timeframes (identity)', () => {
    it.each([
      '1',
      '3',
      '5',
      '15',
      '30',
      '45',
      '60',
      '120',
      '180',
      '240',
      '360',
      '480',
      '720',
      '1D',
      '3D',
      '1W',
      '1M',
      '3M',
      '6M',
      '12M',
    ] as const)('returns %s unchanged', (tf) => {
      expect(normalizeTimeframe(tf)).toBe(tf)
    })
  })

  describe('human aliases', () => {
    it.each([
      ['1m', '1'],
      ['3m', '3'],
      ['5m', '5'],
      ['15m', '15'],
      ['30m', '30'],
      ['45m', '45'],
      ['1h', '60'],
      ['2h', '120'],
      ['3h', '180'],
      ['4h', '240'],
      ['6h', '360'],
      ['8h', '480'],
      ['12h', '720'],
      ['1d', '1D'],
      ['3d', '3D'],
      ['1w', '1W'],
    ] as const)('converts %s → %s', (alias, expected) => {
      expect(normalizeTimeframe(alias)).toBe(expected)
    })
  })

  it('distinguishes 1m (minute) from 1M (month)', () => {
    // This is the whole point of the case-sensitive alias design.
    expect(normalizeTimeframe('1m')).toBe('1')
    expect(normalizeTimeframe('1M')).toBe('1M')
  })

  it('throws TvError on unknown timeframe', () => {
    // `as Timeframe` bypasses compile-time check to test the runtime guard.
    expect(() => normalizeTimeframe('nope' as Timeframe)).toThrow(TvError)
    expect(() => normalizeTimeframe('99x' as Timeframe)).toThrow(/Unknown timeframe/)
  })

  it("also throws when given a plain string that isn't a valid Timeframe", () => {
    expect(() => normalizeTimeframe('')).toThrow(TvError)
  })
})

describe('TIMEFRAME_ALIASES', () => {
  it('lists all supported values', () => {
    // Every alias in the constant should survive a round-trip through the normalizer.
    for (const alias of TIMEFRAME_ALIASES) {
      expect(() => normalizeTimeframe(alias)).not.toThrow()
    }
  })

  it('includes both raw and alias forms', () => {
    expect(TIMEFRAME_ALIASES).toContain('1')
    expect(TIMEFRAME_ALIASES).toContain('1m')
    expect(TIMEFRAME_ALIASES).toContain('1D')
    expect(TIMEFRAME_ALIASES).toContain('1d')
  })
})
