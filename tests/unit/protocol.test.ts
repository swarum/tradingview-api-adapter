import { describe, expect, it } from 'vitest'
import { TvProtocolError } from '../../src/core/errors.js'
import {
  decodeFrames,
  encodeCommand,
  encodeFrame,
  encodeHeartbeat,
} from '../../src/core/protocol.js'

describe('encodeFrame', () => {
  it('wraps a raw string with the ~m~N~m~ header', () => {
    expect(encodeFrame('hello')).toBe('~m~5~m~hello')
  })

  it('serializes objects to JSON', () => {
    const body = JSON.stringify({ m: 'test', p: [] })
    expect(encodeFrame({ m: 'test', p: [] })).toBe(`~m~${body.length}~m~${body}`)
  })

  it('handles empty payload', () => {
    expect(encodeFrame('')).toBe('~m~0~m~')
  })

  it('measures length in UTF-16 code units', () => {
    const emoji = '🚀' // two UTF-16 code units, four UTF-8 bytes
    expect(encodeFrame(emoji)).toBe(`~m~${emoji.length}~m~${emoji}`)
    expect(emoji.length).toBe(2)
  })
})

describe('encodeHeartbeat', () => {
  it('produces a valid heartbeat echo frame', () => {
    expect(encodeHeartbeat(5)).toBe('~m~4~m~~h~5')
    expect(encodeHeartbeat(42)).toBe('~m~5~m~~h~42')
  })

  it('throws on non-finite id', () => {
    expect(() => encodeHeartbeat(Number.NaN)).toThrow(TvProtocolError)
    expect(() => encodeHeartbeat(Number.POSITIVE_INFINITY)).toThrow(TvProtocolError)
  })
})

describe('encodeCommand', () => {
  it('produces a `{m, p}` frame', () => {
    const frame = encodeCommand('quote_add_symbols', ['qs_abc', 'BINANCE:BTCUSDT'])
    expect(frame).toMatch(/^~m~\d+~m~\{.+\}$/)
    const body = frame.replace(/^~m~\d+~m~/, '')
    expect(JSON.parse(body)).toEqual({
      m: 'quote_add_symbols',
      p: ['qs_abc', 'BINANCE:BTCUSDT'],
    })
  })
})

describe('decodeFrames', () => {
  it('returns empty array for empty input', () => {
    expect(decodeFrames('')).toEqual([])
  })

  it('decodes a single heartbeat frame', () => {
    expect(decodeFrames('~m~4~m~~h~5')).toEqual([{ type: 'heartbeat', id: 5 }])
  })

  it('decodes a hello frame (JSON without `m`)', () => {
    const body = JSON.stringify({ session_id: 'sess_abc', timestamp: 123 })
    const raw = `~m~${body.length}~m~${body}`
    expect(decodeFrames(raw)).toEqual([
      { type: 'hello', data: { session_id: 'sess_abc', timestamp: 123 } },
    ])
  })

  it('decodes a command frame (JSON with `m` and `p`)', () => {
    const body = JSON.stringify({
      m: 'qsd',
      p: ['qs_abc', { n: 'BINANCE:BTCUSDT', s: 'ok', v: { lp: 72000 } }],
    })
    const raw = `~m~${body.length}~m~${body}`
    expect(decodeFrames(raw)).toEqual([
      {
        type: 'message',
        method: 'qsd',
        params: ['qs_abc', { n: 'BINANCE:BTCUSDT', s: 'ok', v: { lp: 72000 } }],
      },
    ])
  })

  it('defaults params to [] when `p` is missing or not an array', () => {
    const body = JSON.stringify({ m: 'ping' })
    const raw = `~m~${body.length}~m~${body}`
    expect(decodeFrames(raw)).toEqual([{ type: 'message', method: 'ping', params: [] }])
  })

  it('decodes multiple concatenated frames', () => {
    const body1 = JSON.stringify({ m: 'a', p: [1] })
    const body2 = JSON.stringify({ m: 'b', p: [2] })
    const raw = `~m~${body1.length}~m~${body1}~m~4~m~~h~7~m~${body2.length}~m~${body2}`
    expect(decodeFrames(raw)).toEqual([
      { type: 'message', method: 'a', params: [1] },
      { type: 'heartbeat', id: 7 },
      { type: 'message', method: 'b', params: [2] },
    ])
  })

  it('round-trips encodeFrame → decodeFrames', () => {
    const msg = { m: 'quote_set_fields', p: ['qs_abc', 'lp', 'bid', 'ask'] }
    const frame = encodeCommand(msg.m, msg.p)
    const decoded = decodeFrames(frame)
    expect(decoded).toEqual([{ type: 'message', method: msg.m, params: msg.p }])
  })

  it('throws on missing frame marker', () => {
    expect(() => decodeFrames('hello')).toThrow(TvProtocolError)
  })

  it('throws on unterminated length marker', () => {
    expect(() => decodeFrames('~m~5')).toThrow(TvProtocolError)
  })

  it('throws on non-numeric length', () => {
    expect(() => decodeFrames('~m~abc~m~hi')).toThrow(TvProtocolError)
  })

  it('throws on truncated payload', () => {
    expect(() => decodeFrames('~m~100~m~short')).toThrow(TvProtocolError)
  })

  it('throws on invalid JSON payload', () => {
    expect(() => decodeFrames('~m~6~m~{bad}')).toThrow(TvProtocolError)
  })

  it('skips empty payloads', () => {
    expect(decodeFrames('~m~0~m~')).toEqual([])
  })
})
