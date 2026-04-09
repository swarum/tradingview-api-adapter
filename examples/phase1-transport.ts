/**
 * Phase 1 demo — raw Transport + Protocol against live TradingView.
 *
 * This example uses the low-level primitives exported from
 * `tradingview-api-adapter/internal` to connect to TradingView's public
 * WebSocket, auto-respond to heartbeats, and log every inbound frame.
 *
 * It intentionally does **not** use any higher-level API — no Client, no
 * Symbol, no Stream. The goal is to show that Transport + Protocol are
 * enough to have a live, bidirectional session with TradingView.
 *
 * Run:
 *   npx tsx examples/phase1-transport.ts
 *
 * Enable verbose logging:
 *   DEBUG=tradingview-adapter:* npx tsx examples/phase1-transport.ts
 *
 * Press Ctrl+C to exit cleanly.
 */

import {
  decodeFrames,
  encodeCommand,
  encodeHeartbeat,
  Transport,
  TV_ORIGIN,
  TV_WS_URL,
} from '../src/internal.js'

const transport = new Transport({
  url: TV_WS_URL,
  origin: TV_ORIGIN,
  reconnect: { maxAttempts: 5, initialDelayMs: 500, maxDelayMs: 5000 },
  onOpen: () => console.log('[transport] open'),
  onClose: (info) => console.log('[transport] close', info),
  onReconnect: ({ attempt, delayMs }) =>
    console.log(`[transport] reconnect attempt=${attempt} delay=${delayMs}ms`),
  onError: (err) => console.error('[transport] error:', err.message),
  onMessage: (raw) => {
    let frames
    try {
      frames = decodeFrames(raw)
    } catch (err) {
      console.error('[protocol] decode error:', (err as Error).message)
      return
    }

    for (const frame of frames) {
      switch (frame.type) {
        case 'heartbeat':
          // Echo heartbeat back to keep the session alive.
          transport.send(encodeHeartbeat(frame.id))
          console.log(`[heartbeat] ← ${frame.id}, echoed`)
          break
        case 'hello':
          console.log('[hello]', frame.data)
          break
        case 'message':
          console.log(`[${frame.method}]`, JSON.stringify(frame.params).slice(0, 200))
          break
      }
    }
  },
})

async function main(): Promise<void> {
  await transport.connect()
  console.log('[demo] connected — requesting a BTCUSDT quote')

  // Minimal demo: create a quote session, subscribe to BINANCE:BTCUSDT,
  // request a handful of fields. You should see `qsd` messages rolling in.
  const quoteSessionId = 'qs_demo_' + Math.random().toString(36).slice(2, 10)
  transport.send(encodeCommand('quote_create_session', [quoteSessionId]))
  transport.send(
    encodeCommand('quote_set_fields', [quoteSessionId, 'lp', 'bid', 'ask', 'ch', 'chp', 'volume']),
  )
  transport.send(encodeCommand('quote_add_symbols', [quoteSessionId, 'BINANCE:BTCUSDT']))

  // Run for 15 seconds, then clean up.
  const runMs = 15_000
  console.log(`[demo] running for ${runMs / 1000}s…`)
  await new Promise((resolve) => setTimeout(resolve, runMs))

  transport.send(encodeCommand('quote_delete_session', [quoteSessionId]))
  await transport.close()
  console.log('[demo] done')
}

main().catch((err) => {
  console.error('[demo] fatal:', err)
  transport.destroy()
  process.exit(1)
})

// Graceful Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[demo] SIGINT — closing')
  transport
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
})
