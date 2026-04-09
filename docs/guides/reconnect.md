# Reconnect guide

How automatic reconnect works, how to configure it, and what to
expect from your subscriptions during an outage.

## What reconnects

`tradingview-api-adapter` automatically reconnects on **unexpected**
WebSocket drops — network partitions, TV server restarts, proxy
timeouts, mobile network switches.

It does **not** reconnect after:

- `client.disconnect()` (explicit shutdown)
- `reconnect.maxAttempts` is exhausted
- The `AbortSignal` passed in options fires

## Defaults

```ts
reconnect: {
  enabled: true,
  maxAttempts: 10,
  initialDelayMs: 100,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: 0.3,
}
```

The backoff formula:

```
delay(n) = min(initialDelayMs * factor^(n-1), maxDelayMs) ± jitter%
```

With defaults, the sequence is roughly:

```
attempt 1: ~100 ms
attempt 2: ~200 ms
attempt 3: ~400 ms
attempt 4: ~800 ms
attempt 5: ~1.6 s
attempt 6: ~3.2 s
attempt 7: ~6.4 s
attempt 8: ~12.8 s
attempt 9: ~25.6 s
attempt 10: ~30 s (clamped)
```

±30% jitter is applied at each step to prevent thundering-herd
behaviour when many clients disconnect simultaneously.

## Configuring

```ts
const client = tv({
  reconnect: {
    maxAttempts: 20, // try harder
    initialDelayMs: 500, // start slower
    maxDelayMs: 60_000, // go up to 1 min
    factor: 1.5, // gentler ramp
    jitter: 0.5, // more randomness
  },
})
```

To disable reconnect entirely (e.g. for tests):

```ts
tv({ reconnect: { enabled: false } })
```

## Observing reconnect

Three client-level events track the lifecycle:

```ts
client.on('close', () => {
  console.log('disconnected — reconnect pending')
})

client.on('reconnect', ({ attempt, delayMs }) => {
  console.log(`reconnect attempt ${attempt}, waiting ${delayMs}ms`)
})

client.on('open', () => {
  console.log('back online')
})
```

## What happens to subscriptions

When the transport reconnects:

1. The library automatically re-issues `set_auth_token` and `set_locale`.
2. Every active `QuoteSession` and `ChartSession` is **replayed** —
   their `create_session`, `set_fields`, and `add_symbols` commands
   are re-sent with the same IDs.
3. Fresh `qsd` (quote data) and `timescale_update` messages start
   arriving as TradingView re-subscribes you.
4. All your `Stream` and `MultiStream` listeners keep receiving
   events — they never saw the outage from their perspective.

This means your application code **does not need to do anything
special** around reconnect. Just register your handlers once and let
the library handle failover.

## What fails during an outage

- `price()`, `snapshot()`, `info()`, `candles()` called during the
  outage will **wait** for reconnect and then resolve — unless they
  hit their individual timeouts.
- Streams emit no events while disconnected. They don't buffer
  missed ticks (TradingView doesn't retransmit) — you see a gap
  in the data and then fresh ticks from after the reconnect.
- `client.on('error')` may fire for transient WebSocket errors, but
  this does not imply a permanent failure.

## When reconnect gives up

If all `maxAttempts` are exhausted (server is completely unreachable):

1. The client transitions to `closed` state.
2. `client.on('close')` fires.
3. Any pending `price()` / `snapshot()` / etc. calls reject with
   `TvConnectionError`.
4. You need to either:
   - Call `client.connect()` again manually
   - Create a new `tv()` client

## Testing reconnect locally

The cleanest way to verify reconnect works in your app:

```ts
// 1. Start a normal client and stream
const client = tv()
client.symbol('BINANCE:BTCUSDT').stream().on('price', log)

// 2. Force-drop the transport (simulates network failure)
client.manager.transport.destroy()

// 3. Observe the client.on('reconnect') events
// 4. Eventually 'open' fires and new prices arrive
```

See [`examples/09-reconnect-resilience.ts`](../../examples/09-reconnect-resilience.ts)
for a runnable demo.

## Rate limit interaction

If reconnect triggers many symbol re-subscriptions at once, the
client-side rate limiter (`rateLimit` option) batches them into
`quote_add_symbols` commands with up to `chunkSize` symbols each,
separated by `chunkIntervalMs`. The defaults (50 symbols per 100 ms
chunk) comfortably stay under any undocumented TradingView limits.
