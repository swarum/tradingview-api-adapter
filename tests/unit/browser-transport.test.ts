/**
 * Smoke test that verifies the Transport code path is browser-safe:
 *   - `window` is defined (happy-dom simulates DOM)
 *   - `globalThis.WebSocket` is available (provided by happy-dom)
 *   - `Transport.connect()` uses the native WebSocket and does NOT
 *     attempt to dynamically import the `ws` package
 *
 * The happy-dom WebSocket is a stub that never actually connects, so
 * we abandon the pending `connect()` promise and just assert the
 * socket was instantiated on the correct path.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Transport } from '../../src/core/transport.js'
import { sleep } from '../helpers/wait-for.js'

describe('Transport in a browser-like environment (happy-dom)', () => {
  let nativeConstructed: string[] = []
  let OriginalWebSocket: typeof WebSocket

  beforeEach(() => {
    OriginalWebSocket = globalThis.WebSocket
    nativeConstructed = []

    class FakeWebSocket {
      public url: string
      public readyState = 0
      public onopen: ((ev: Event) => void) | null = null
      public onclose: ((ev: CloseEvent) => void) | null = null
      public onmessage: ((ev: MessageEvent) => void) | null = null
      public onerror: ((ev: Event) => void) | null = null

      constructor(url: string) {
        this.url = url
        nativeConstructed.push(url)
      }

      send(_data: unknown): void {
        /* no-op */
      }
      close(_code?: number, _reason?: string): void {
        this.readyState = 3
      }
      addEventListener(): void {
        /* no-op */
      }
      removeEventListener(): void {
        /* no-op */
      }
      dispatchEvent(): boolean {
        return true
      }
    }

    ;(globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    ;(globalThis as { WebSocket: typeof WebSocket }).WebSocket = OriginalWebSocket
  })

  it('defines window and WebSocket globals', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('object')
    expect(typeof globalThis.WebSocket).toBe('function')
  })

  it('creates a native WebSocket instead of loading the ws package', async () => {
    const t = new Transport({ url: 'ws://example.com/sock', reconnect: { enabled: false } })

    // Kick off connect() but don't await it — our fake socket never
    // fires 'open' so the returned promise would hang forever. We
    // attach a `.catch` so there's no unhandled rejection warning.
    void t.connect().catch(() => {
      /* expected to never resolve */
    })

    // Give the async createSocket() a couple of microtasks + a tick
    // to run through its dynamic-import branch check.
    await sleep(20)

    expect(nativeConstructed).toEqual(['ws://example.com/sock'])

    t.destroy()
  })
})
