/**
 * Minimal in-process WebSocket server for Transport integration tests.
 *
 * Each test gets a fresh server on a random free port. The server exposes
 * hooks to push messages to clients and to drop existing connections, so
 * we can simulate network drops without killing the listening socket.
 */

import type { AddressInfo } from 'node:net'
import { WebSocketServer, type WebSocket as ServerWebSocket } from 'ws'

export interface MockServer {
  url: string
  port: number
  /** All currently connected clients. */
  clients(): ServerWebSocket[]
  /** Broadcast a raw string to every connected client. */
  broadcast(raw: string): void
  /** Forcefully terminate all active client sockets (keeps listener alive). */
  disconnectAll(): void
  /** Handler invoked for each new inbound client message. */
  onClientMessage(fn: (client: ServerWebSocket, raw: string) => void): void
  /** Stop the server and release the port. */
  close(): Promise<void>
}

export async function startMockServer(port = 0): Promise<MockServer> {
  const wss = new WebSocketServer({ port })
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve())
    wss.once('error', reject)
  })

  const actualPort = (wss.address() as AddressInfo).port
  const messageHandlers: Array<(client: ServerWebSocket, raw: string) => void> = []
  let closed = false

  wss.on('connection', (client) => {
    client.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8')
      for (const fn of messageHandlers) fn(client, raw)
    })
  })

  return {
    url: `ws://localhost:${actualPort}`,
    port: actualPort,
    clients: () => Array.from(wss.clients),
    broadcast(raw) {
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) client.send(raw)
      }
    },
    disconnectAll() {
      // Use terminate() to simulate a real network drop: the client socket
      // fires a close event with code 1006 and wasClean=false. Using
      // close() here would be a no-op because ws silently ignores reserved
      // codes like 1006, and normal codes would look like a graceful close.
      for (const client of wss.clients) {
        try {
          client.terminate()
        } catch {
          /* ignore */
        }
      }
    },
    onClientMessage(fn) {
      messageHandlers.push(fn)
    },
    async close() {
      if (closed) return
      closed = true
      // Forcibly terminate lingering clients so close() resolves promptly.
      for (const client of wss.clients) {
        try {
          client.terminate()
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}
