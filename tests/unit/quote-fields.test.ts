/**
 * Type-level tests for `QuoteSnapshot<F>` + runtime sanity checks on
 * the `QuoteFieldTypeMap`.
 *
 * These use Vitest's `expectTypeOf` which is evaluated at typecheck
 * time (via `tsc --noEmit`) and is a no-op at runtime — so each
 * `it(...)` block doubles as both a compile-time guarantee and a
 * runtime smoke test.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  BarTick,
  QuoteField,
  QuoteFieldTypeMap,
  QuoteSnapshot,
  TradeTick,
} from '../../src/types/quote-fields.js'

describe('QuoteField union', () => {
  it('is the union of QuoteFieldTypeMap keys', () => {
    expectTypeOf<QuoteField>().toEqualTypeOf<keyof QuoteFieldTypeMap>()
  })

  it('includes the most common fields', () => {
    // These must compile without errors.
    const lp: QuoteField = 'lp'
    const bid: QuoteField = 'bid'
    const ask: QuoteField = 'ask'
    const ch: QuoteField = 'ch'
    const chp: QuoteField = 'chp'
    const volume: QuoteField = 'volume'
    const trade: QuoteField = 'trade'
    const minuteBar: QuoteField = 'minute-bar'

    expect(lp).toBe('lp')
    expect(bid).toBe('bid')
    expect(ask).toBe('ask')
    expect(ch).toBe('ch')
    expect(chp).toBe('chp')
    expect(volume).toBe('volume')
    expect(trade).toBe('trade')
    expect(minuteBar).toBe('minute-bar')
  })

  it('rejects unknown field names at compile time', () => {
    // @ts-expect-error — 'lastPrice' is not a valid QuoteField
    const bad: QuoteField = 'lastPrice'
    void bad
  })
})

describe('QuoteSnapshot<F>', () => {
  it('is shaped as a Partial<Pick> of QuoteFieldTypeMap', () => {
    type Snap = QuoteSnapshot<['lp', 'bid', 'ask']>
    expectTypeOf<Snap>().toEqualTypeOf<{
      lp?: number | null
      bid?: number | null
      ask?: number | null
    }>()
  })

  it('types `lp` as number | null | undefined', () => {
    type Snap = QuoteSnapshot<['lp']>
    expectTypeOf<Snap['lp']>().toEqualTypeOf<number | null | undefined>()
  })

  it('types `trade` as TradeTick | undefined', () => {
    type Snap = QuoteSnapshot<['trade']>
    expectTypeOf<Snap['trade']>().toEqualTypeOf<TradeTick | undefined>()
  })

  it('types `minute-bar` as BarTick | undefined', () => {
    type Snap = QuoteSnapshot<['minute-bar']>
    expectTypeOf<Snap['minute-bar']>().toEqualTypeOf<BarTick | undefined>()
  })

  it('types string fields as string | undefined', () => {
    type Snap = QuoteSnapshot<['description', 'exchange']>
    expectTypeOf<Snap['description']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Snap['exchange']>().toEqualTypeOf<string | undefined>()
  })

  it('types boolean fields correctly', () => {
    type Snap = QuoteSnapshot<['is_tradable', 'fractional']>
    expectTypeOf<Snap['is_tradable']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Snap['fractional']>().toEqualTypeOf<boolean | undefined>()
  })

  it('accepts readonly arrays', () => {
    const _fields = ['lp', 'bid'] as const
    type Snap = QuoteSnapshot<typeof _fields>
    expectTypeOf<Snap>().toEqualTypeOf<{ lp?: number | null; bid?: number | null }>()
  })
})

describe('TradeTick and BarTick shapes', () => {
  it('TradeTick has the expected fields', () => {
    const tick: TradeTick = {
      'data-update-time': '1775761200.123',
      price: '72000',
      size: '0.01',
      time: '1775761200',
    }
    expectTypeOf(tick).toMatchTypeOf<TradeTick>()
  })

  it('BarTick has open/high/low/close/volume/time', () => {
    const bar: BarTick = {
      open: '71000',
      high: '72500',
      low: '70900',
      close: '72000',
      volume: '100',
      time: '1775761200',
      'update-time': '1775761230',
      'data-update-time': '1775761230.456',
    }
    expectTypeOf(bar).toMatchTypeOf<BarTick>()
  })
})

/**
 * Import expect here so the runtime assertions in the smoke tests work.
 * (We can't put it at the top because Vitest auto-injects it for type-only
 * test files but not for mixed ones.)
 */
import { expect } from 'vitest'
