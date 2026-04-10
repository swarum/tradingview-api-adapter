# Auth guide

When and how to use TradingView credentials with
`tradingview-api-adapter`.

## You probably don't need auth

**The default anonymous mode is enough for 90% of use cases.** Out of
the box, the library supports:

- Real-time crypto quotes (Binance, Coinbase, Kraken, all major exchanges)
- Real-time forex quotes
- Real-time futures quotes on most exchanges
- **Delayed** stock quotes (US stocks: 15 min delay)
- Historical candles at any timeframe
- Symbol metadata
- Multi-symbol streams
- Reconnect, proxy, everything else

No API keys, no registration, no auth headers. Just `tv()` and go.

## What auth unlocks

Passing credentials only matters if you need:

1. **Real-time US stock quotes.** Without auth, NYSE/NASDAQ quotes
   are delayed 15 minutes (TradingView's licensing requires this).
   With auth from a TradingView account that has real-time exchange
   permissions, you get live data.

2. **Exchange-licensed data.** TradingView sells real-time data
   subscriptions to specific exchanges (CME, ICE, EUREX, JPX, …).
   If you've purchased one, your auth unlocks it via the WebSocket.

3. **Invite-only Pine indicators.** Studies published by other users
   as invite-only require you to be logged in to see them.

4. **Higher rate limits.** Anonymous clients share a stricter quota
   pool than authenticated ones.

## Getting credentials

1. Log in to [tradingview.com](https://www.tradingview.com) in your browser.
2. Open DevTools → Application (or Storage) → Cookies → `tradingview.com`.
3. Copy the values of:
   - `sessionid`
   - `sessionid_sign`

These two cookies together are your "proof of login".

## Passing credentials

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv({
  auth: {
    sessionid: process.env.TV_SESSIONID!,
    sessionidSign: process.env.TV_SESSIONID_SIGN!,
  },
})
```

**Never hardcode credentials in source code.** Use environment
variables, a secrets manager, or your deployment platform's secret
store.

The library sends them as a `Cookie` header on the WebSocket
handshake. TradingView's servers verify the cookies and associate
your session with the connection.

## `authToken` — the advanced option

Some features require a per-session `authToken` — a JWT-like string
that TradingView issues in response to an HTTP call with your
`sessionid`. The library does **not** fetch this token for you (to
keep the surface small and avoid an HTTP dependency).

If you have your own auth flow that produces an `authToken`, pass it
directly:

```ts
const client = tv({
  auth: {
    sessionid: '...',
    sessionidSign: '...',
    authToken: 'eyJ0eXAiOiJKV1QiL...', // your token
  },
})
```

The library sends it via the `set_auth_token` message right after
the TradingView server hello.

Without an explicit `authToken`, the library defaults to
`"unauthorized_user_token"`, which is sufficient for public quotes
and candles.

## `locale` option

TradingView keys certain metadata (symbol descriptions, session
names, error messages) by locale. The default is `['en', 'US']`.
Override if needed:

```ts
const client = tv({
  locale: ['uk', 'UA'],
})
```

## Example

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv({
  auth: {
    sessionid: process.env.TV_SESSIONID!,
    sessionidSign: process.env.TV_SESSIONID_SIGN!,
  },
  locale: ['en', 'US'],
})

// Real-time AAPL quote (delayed without auth)
const aapl = client.symbol('NASDAQ:AAPL')
const price = await aapl.price()
console.log(`AAPL: $${price}`)

await client.disconnect()
```

See [`examples/12-auth-session.ts`](../../examples/12-auth-session.ts)
for a runnable version.

## Browser caveats

Credentials-based auth is **Node-only**. In the browser:

- Custom `Cookie` headers on WebSocket handshakes are controlled by
  the browser, not the code. The library cannot set them.
- However, if your browser is already logged in to tradingview.com
  and your page is served from a TV-family domain, the browser may
  attach TV cookies automatically. In practice this only works for
  embedded widgets on TV pages themselves.
- For authenticated browser usage, proxy the connection through your
  own backend server that adds the credentials. See
  [browser guide](browser.md).

## Rotating credentials

`sessionid` cookies are long-lived but not permanent. If your
connection starts failing with authorization errors, log back in on
tradingview.com and copy a fresh `sessionid`.

There's no built-in refresh mechanism — you need to detect the
failure, fetch new credentials through your own auth flow, and
create a new `Client`.

## Security considerations

- `sessionid` is equivalent to your tradingview.com login — treat it
  like a password.
- Don't commit it to git. Don't log it. Don't send it to third
  parties.
- Use environment variables, not hardcoded strings.
- Consider a separate TradingView account dedicated to API access,
  rather than your main personal account.
- Rotate credentials periodically, especially if you share code or
  systems.
