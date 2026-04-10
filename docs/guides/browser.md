# Browser guide

`tradingview-api-adapter` is designed to work in both Node and the
browser. This guide covers how the dual-runtime support works, what
you need to know about TradingView's origin check, and how to
integrate with popular frameworks.

## Dual-runtime by design

The library detects the runtime at connection time:

1. **Browser-like** (`globalThis.window` + `globalThis.WebSocket` defined)
   → uses the native `WebSocket`.
2. **Node-like** → dynamically imports the `ws` package via
   `import('ws')` and uses it for richer handshake headers.
3. **Bun / Deno / Cloudflare Workers** → fall back to native
   `WebSocket` when `ws` can't be loaded.

Because `ws` is loaded through a **dynamic import**, browser
bundlers (Vite, webpack, Rollup, esbuild) automatically drop it
from browser bundles. No conditional exports, no separate builds.

## Bundler setup

No bundler configuration needed. Just import and go:

```ts
// Vite, webpack, Rollup, esbuild, etc.
import { tv } from 'tradingview-api-adapter'

const client = tv()
```

The library is published as ESM + CJS with proper `exports` in
`package.json`, so every modern bundler handles it correctly.

## CDN usage

For small demos or non-build projects, load directly from a CDN:

```html
<script type="module">
  import { tv } from 'https://esm.sh/tradingview-api-adapter'
  // or jsDelivr, unpkg, Skypack…

  const client = tv()
  const btc = client.symbol('BINANCE:BTCUSDT')

  btc.stream().on('price', ({ price }) => {
    document.getElementById('price').textContent = price
  })
</script>
```

See [`examples/10-browser.html`](../../examples/10-browser.html) for
a complete HTML demo.

## The origin header problem

TradingView's WebSocket endpoint checks the `Origin` header to
decide whether to accept the connection. This is their anti-abuse
mechanism.

### In Node

We automatically set `Origin: https://s.tradingview.com` on the
handshake. This is why Node usage "just works" — TradingView sees a
plausible TV-family origin and accepts.

### In the browser

The `Origin` header is controlled **by the browser**, not by code.
It is automatically set to the page's own origin. So:

- Page at `https://www.tradingview.com/chart/...` → origin matches, accepted
- Page at `http://localhost:3000` → origin is `http://localhost:3000`, may be rejected
- Page at `https://my-app.com` → origin is `https://my-app.com`, likely rejected

**This is a fundamental browser security feature and applies to
every TradingView WebSocket client in the browser, not just ours.**

### Workarounds

If you need to run the library from a non-TV domain in the browser:

#### Option 1: Proxy through your own backend

Run the library on a Node server you control. Expose the data to
your frontend via your own WebSocket or REST API. This is the most
reliable option.

```
Frontend → Your backend (Node + tradingview-api-adapter) → TradingView
```

#### Option 2: Server-side rendering

Fetch the data on the server during SSR (Next.js, Nuxt, SvelteKit,
Astro) and ship the initial HTML with prices already rendered.
Only switch to client-side streaming if the initial page load is
enough for your use case.

#### Option 3: CORS-friendly proxy

Set up an HTTPS reverse proxy that forwards WebSocket upgrades and
rewrites the `Origin` header. Nginx example:

```nginx
location /tv-ws {
  proxy_pass https://widgetdata.tradingview.com/socket.io/websocket;
  proxy_set_header Origin https://s.tradingview.com;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Then in your browser code:

```ts
const client = tv({ url: 'wss://my-domain.com/tv-ws' })
```

## Vue 3 integration

```ts
// composables/useTradingView.ts
import { ref, onMounted, onUnmounted } from 'vue'
import { tv, type Client } from 'tradingview-api-adapter'

export function useTradingView() {
  const client: Client = tv()
  const price = ref<number | null>(null)

  onMounted(async () => {
    const btc = client.symbol('BINANCE:BTCUSDT')
    const stream = btc.stream(['lp'] as const)
    stream.on('price', ({ price: p }) => (price.value = p))
  })

  onUnmounted(async () => {
    await client.disconnect()
  })

  return { price }
}
```

## React integration

```tsx
import { useEffect, useState } from 'react'
import { tv } from 'tradingview-api-adapter'

export function BtcPrice() {
  const [price, setPrice] = useState<number | null>(null)

  useEffect(() => {
    const client = tv()
    const btc = client.symbol('BINANCE:BTCUSDT')
    const stream = btc.stream(['lp'] as const)
    stream.on('price', ({ price: p }) => setPrice(p))

    return () => {
      void client.disconnect()
    }
  }, [])

  return <div>BTC: {price ?? 'loading…'}</div>
}
```

## Next.js integration

Use `'use client'` for the component and wrap the hook in
`useEffect` as above. On the server side (SSR, API routes) the
library works identically to Node.

## Cleanup is critical in SPAs

Always call `client.disconnect()` on component unmount. Forgetting
to clean up leaves open WebSocket connections that will leak as
users navigate around your app — eventually triggering browser
limits (most browsers cap at ~255 WebSocket connections per tab).

```ts
// React
useEffect(() => {
  const client = tv()
  return () => {
    void client.disconnect()
  }
}, [])

// Vue 3
onUnmounted(async () => {
  await client.disconnect()
})
```

## Known browser limitations

Because `Origin`, `Cookie`, and custom headers are controlled by the
browser (not the code), these features are **Node-only**:

- `origin` option — ignored, browser auto-sets it
- `headers` option — ignored, browser controls the handshake
- `agent` option (proxy) — not supported, use a server-side proxy
- `auth.sessionid` / `auth.sessionidSign` — ignored in browsers;
  however, if your page is served from tradingview.com (or similar),
  the browser may attach TV cookies automatically

For everything else (quotes, streams, candles, symbol info, groups)
the browser path behaves identically to Node.
