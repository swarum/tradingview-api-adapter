/**
 * Random alphanumeric id generator.
 *
 * Used for session identifiers (quote session, chart session) sent to
 * TradingView. Not cryptographically secure — just collision-resistant
 * enough for in-flight session multiplexing.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomId(length = 12, random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CHARS.charAt(Math.floor(random() * CHARS.length))
  }
  return out
}
