# Proxy guide (Node only)

How to tunnel the WebSocket connection through an HTTP or SOCKS
proxy.

## Why you might need this

- Corporate firewall that blocks `widgetdata.tradingview.com`
- Running behind a Kubernetes egress gateway
- Geolocation testing
- Aggregating traffic through a single outbound IP

Proxies are a **Node-only** feature. Browsers do not expose a way
for application code to choose a proxy for a WebSocket — that's
controlled by the user's OS-level network settings.

## Basic setup

Install any `http.Agent`-compatible proxy client. The most common
choices:

```bash
npm install https-proxy-agent  # HTTP and HTTPS proxies
npm install socks-proxy-agent  # SOCKS4, SOCKS5
```

Pass the agent to `tv()`:

```ts
import { tv } from 'tradingview-api-adapter'
import { HttpsProxyAgent } from 'https-proxy-agent'

const client = tv({
  agent: new HttpsProxyAgent('http://proxy.example.com:3128'),
})

const price = await client.symbol('BINANCE:BTCUSDT').price()
```

## Authenticated proxies

If your proxy requires credentials, embed them in the URL:

```ts
new HttpsProxyAgent('http://user:password@proxy.example.com:3128')
```

Or use the constructor options exposed by your proxy library of
choice.

## SOCKS proxies

```ts
import { tv } from 'tradingview-api-adapter'
import { SocksProxyAgent } from 'socks-proxy-agent'

const client = tv({
  agent: new SocksProxyAgent('socks5://127.0.0.1:1080'),
})
```

## TLS / self-signed certs

If your proxy uses a self-signed TLS certificate, pass the
agent's options through the proxy library:

```ts
import { HttpsProxyAgent } from 'https-proxy-agent'
import fs from 'node:fs'

const agent = new HttpsProxyAgent({
  host: 'proxy.example.com',
  port: 3128,
  ca: fs.readFileSync('/path/to/custom-ca.pem'),
})

const client = tv({ agent })
```

## Debugging

Enable transport-level logging to see the underlying WebSocket
events — errors and reconnect attempts show up here:

```bash
DEBUG=tradingview-adapter:transport node your-app.js
```

Common failure modes:

- **`ECONNREFUSED`** — proxy is not running or wrong port
- **`407 Proxy Authentication Required`** — credentials missing or wrong
- **`ENOTFOUND`** — DNS can't resolve the proxy host
- **`CERT_HAS_EXPIRED`** — proxy's TLS cert is invalid

## Rate limits and proxies

If you share one proxy across many clients, TradingView will see
all requests coming from the same IP. This may trigger rate limiting
faster than normal. Consider:

- Multiple proxies with round-robin
- Authentication (`auth.sessionid`) to scale up per-user quotas
- Reducing `rateLimit.chunkSize` to spread subscription bursts

## Bypassing the proxy for some traffic

You can create two `Client` instances with different `agent`
configurations — one through the proxy, one direct — if you need
to query some endpoints directly and others via the tunnel.

## Complete example

See [`examples/11-proxy-node.ts`](../../examples/11-proxy-node.ts).
