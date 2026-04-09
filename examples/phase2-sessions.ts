/**
 * Phase 2 demo — SessionManager + QuoteSession + ChartSession against live TradingView.
 *
 * This example shows the Phase 2 primitives composing into a working
 * client: a single SessionManager owns the Transport, multiplexes a
 * QuoteSession (live price updates) and a ChartSession (historical +
 * live candles), and tears them down cleanly on exit.
 *
 * Run:
 *   npx tsx examples/phase2-sessions.ts
 *
 * Enable verbose logging:
 *   DEBUG=tradingview-adapter:* npx tsx examples/phase2-sessions.ts
 *
 * Press Ctrl+C to stop.
 */

import { ChartSession, QuoteSession, SessionManager } from '../src/internal.js'

const manager = new SessionManager({
  reconnect: { maxAttempts: 5, initialDelayMs: 500, maxDelayMs: 5000 },
})

const quotes = new QuoteSession({
  manager,
  onUpdate: ({ symbol, delta, snapshot, isFirstLoad }) => {
    const tag = isFirstLoad ? 'first' : 'delta'
    console.log(
      `[quote:${tag}] ${symbol}`,
      'lp=%s bid=%s ask=%s vol=%s',
      snapshot.lp ?? '-',
      snapshot.bid ?? '-',
      snapshot.ask ?? '-',
      snapshot.volume ?? '-',
    )
    void delta // unused — full snapshot is enough for the demo
  },
  onError: (e) => console.error('[quote:error]', e),
  onComplete: (symbol) => console.log('[quote:complete]', symbol),
})

const chart = new ChartSession({
  manager,
  onCandles: ({ symbol, candles }) => {
    console.log(`[candles:initial] ${symbol}: ${candles.length} bars`)
    const first = candles[0]
    const last = candles[candles.length - 1]
    if (first && last) {
      console.log(
        `[candles:range] ${symbol} from=${new Date(first.time * 1000).toISOString()} to=${new Date(last.time * 1000).toISOString()}`,
      )
      console.log(`[candles:last] ${symbol}`, last)
    }
  },
  onTick: ({ symbol, candle }) => {
    console.log(
      `[candles:tick] ${symbol} t=${candle.time} close=${candle.close} vol=${candle.volume}`,
    )
  },
  onError: (e) => console.error('[chart:error]', e.message),
})

async function main(): Promise<void> {
  console.log('[demo] connecting...')
  await manager.connect()
  console.log('[demo] ready. hello =', manager.getHelloData())

  quotes.setFields(['lp', 'bid', 'ask', 'ch', 'chp', 'volume'])
  quotes.addSymbols(['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NASDAQ:AAPL'])

  chart.requestSeries({
    symbol: 'BINANCE:BTCUSDT',
    timeframe: '60',
    barCount: 5,
  })

  const runMs = 20_000
  console.log(`[demo] running for ${runMs / 1000}s…`)
  await new Promise((r) => setTimeout(r, runMs))

  console.log('[demo] cleaning up')
  await quotes.delete()
  await chart.delete()
  await manager.disconnect()
  console.log('[demo] done')
}

main().catch((err) => {
  console.error('[demo] fatal:', err)
  void manager.disconnect()
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\n[demo] SIGINT — cleaning up')
  void manager
    .disconnect()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
})
