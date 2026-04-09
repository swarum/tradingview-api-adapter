import { describe, expect, it } from 'vitest'
import { kebabToCamel, transformKeys } from '../../src/utils/kebab-to-camel.js'

describe('kebabToCamel', () => {
  it('returns empty string for empty input', () => {
    expect(kebabToCamel('')).toBe('')
  })

  it('leaves a plain string untouched', () => {
    expect(kebabToCamel('symbol')).toBe('symbol')
    expect(kebabToCamel('camelCase')).toBe('camelCase')
  })

  it('converts a single kebab segment', () => {
    expect(kebabToCamel('series-key')).toBe('seriesKey')
  })

  it('converts a single snake segment', () => {
    expect(kebabToCamel('base_name')).toBe('baseName')
  })

  it('converts multi-segment kebab strings', () => {
    expect(kebabToCamel('session-regular-display')).toBe('sessionRegularDisplay')
    expect(kebabToCamel('has-no-bbo')).toBe('hasNoBbo')
  })

  it('converts multi-segment snake strings', () => {
    expect(kebabToCamel('is_tradable')).toBe('isTradable')
    expect(kebabToCamel('base_currency_id')).toBe('baseCurrencyId')
  })

  it('handles mixed kebab and snake', () => {
    expect(kebabToCamel('rt-update_time')).toBe('rtUpdateTime')
  })

  it('preserves numeric segments', () => {
    expect(kebabToCamel('price_52_week_high')).toBe('price52WeekHigh')
    expect(kebabToCamel('first-bar-time-1s')).toBe('firstBarTime1s')
  })

  it('collapses consecutive separators', () => {
    expect(kebabToCamel('a--b')).toBe('aB')
    expect(kebabToCamel('a__b')).toBe('aB')
    expect(kebabToCamel('a-_b')).toBe('aB')
  })

  it('handles leading separator by capitalising the first letter', () => {
    // A leading `-` is consumed by the regex and the next char is
    // upper-cased. TradingView never emits keys starting with `-`, but
    // we document the behaviour for completeness.
    expect(kebabToCamel('-foo')).toBe('Foo')
    expect(kebabToCamel('_bar')).toBe('Bar')
  })
})

describe('transformKeys', () => {
  it('converts top-level keys without touching values', () => {
    const input = {
      'series-key': 'BINANCE:BTC',
      base_name: ['BINANCE:BTC'],
      is_tradable: true,
      nested: { inner_key: 42 },
    }
    const out = transformKeys(input)
    expect(out).toEqual({
      seriesKey: 'BINANCE:BTC',
      baseName: ['BINANCE:BTC'],
      isTradable: true,
      // nested object keys are NOT recursively converted
      nested: { inner_key: 42 },
    })
  })

  it('handles empty object', () => {
    expect(transformKeys({})).toEqual({})
  })

  it('does NOT recurse into arrays of objects', () => {
    const input = {
      sub_sessions: [{ some_field: 1 }, { other_field: 2 }],
    }
    const out = transformKeys(input)
    expect(out).toEqual({
      subSessions: [{ some_field: 1 }, { other_field: 2 }],
    })
  })

  it('preserves null and undefined values', () => {
    const input = { first_key: null, second_key: undefined }
    expect(transformKeys(input)).toEqual({ firstKey: null, secondKey: undefined })
  })
})
