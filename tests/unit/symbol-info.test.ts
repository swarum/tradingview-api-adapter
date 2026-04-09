import { describe, expect, it } from 'vitest'
import { symbolInfoFromRaw, type SymbolInfo } from '../../src/types/symbol-info.js'

describe('symbolInfoFromRaw', () => {
  it('converts a typical `symbol_resolved` payload to camelCase', () => {
    const raw = {
      'series-key': 'BINANCE:BTCUSDT',
      base_name: ['BINANCE:BTCUSDT'],
      symbol: 'BTCUSDT',
      'symbol-fullname': 'BINANCE:BTCUSDT',
      'session-id': 'crypto',
      'session-regular-display': '24x7',
      is_tradable: false,
      'has-intraday': true,
      pricescale: 100,
      description: 'Bitcoin / TetherUS',
      base_currency: 'BTC',
    }

    const info = symbolInfoFromRaw(raw)

    expect(info.seriesKey).toBe('BINANCE:BTCUSDT')
    expect(info.baseName).toEqual(['BINANCE:BTCUSDT'])
    expect(info.symbol).toBe('BTCUSDT')
    expect(info.symbolFullname).toBe('BINANCE:BTCUSDT')
    expect(info.sessionId).toBe('crypto')
    expect(info.sessionRegularDisplay).toBe('24x7')
    expect(info.isTradable).toBe(false)
    expect(info.hasIntraday).toBe(true)
    expect(info.description).toBe('Bitcoin / TetherUS')
    expect(info.baseCurrency).toBe('BTC')
  })

  it('preserves nested object key casing (marketStatus.tradingday etc.)', () => {
    const raw = {
      'market-status': { phase: 'regular', tradingday: '20260409' },
    }
    const info = symbolInfoFromRaw(raw)
    expect(info.marketStatus).toEqual({ phase: 'regular', tradingday: '20260409' })
  })

  it('preserves local_popularity country keys unchanged', () => {
    const raw = {
      local_popularity: { US: 1, DE: 2, IN: 3 },
    }
    const info = symbolInfoFromRaw(raw)
    expect(info.localPopularity).toEqual({ US: 1, DE: 2, IN: 3 })
  })

  it('forwards unknown fields via index signature', () => {
    const raw = {
      'brand-new-field': 'hello',
      another_new_thing: 42,
    }
    const info = symbolInfoFromRaw(raw)
    expect(info.brandNewField).toBe('hello')
    expect(info.anotherNewThing).toBe(42)
  })

  it('returns a SymbolInfo-typed object', () => {
    const raw = { is_tradable: true, pricescale: 100 }
    const info: SymbolInfo = symbolInfoFromRaw(raw)
    expect(info.isTradable).toBe(true)
    expect(info.pricescale).toBe(100)
  })

  it('handles empty input', () => {
    expect(symbolInfoFromRaw({})).toEqual({})
  })
})
