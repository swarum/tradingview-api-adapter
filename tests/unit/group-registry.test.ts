import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tv, type Client } from '../../src/api/client.js'
import { Group } from '../../src/api/group.js'
import { encodeFrame } from '../../src/core/protocol.js'
import { TvError } from '../../src/core/errors.js'
import { startMockServer, type MockServer } from '../fixtures/ws-server.js'

const HELLO = JSON.stringify({ session_id: 'mock', timestamp: 1, protocol: 'json' })

describe('GroupRegistry', () => {
  let server: MockServer
  let client: Client | null = null

  beforeEach(async () => {
    server = await startMockServer()
  })

  afterEach(async () => {
    if (client) {
      await client.disconnect()
      client = null
    }
    await server.close()
  })

  async function setup(): Promise<Client> {
    server.onConnection((c) => c.send(encodeFrame(HELLO)))
    client = tv({
      url: server.url,
      origin: undefined,
      reconnect: { enabled: false },
    })
    await client.connect()
    return client
  }

  it('exposes list and size', async () => {
    const c = await setup()
    expect(c.groups.size).toBe(0)
    expect(c.groups.list).toEqual([])

    c.createGroup('crypto', [])
    c.createGroup('stocks', [])

    expect(c.groups.size).toBe(2)
    expect(new Set(c.groups.list)).toEqual(new Set(['crypto', 'stocks']))
  })

  it('get() returns the stored group or undefined', async () => {
    const c = await setup()
    const g = c.createGroup('g', [])
    expect(c.groups.get('g')).toBe(g)
    expect(c.groups.get('nope')).toBeUndefined()
  })

  it('has() reflects presence', async () => {
    const c = await setup()
    c.createGroup('g', [])
    expect(c.groups.has('g')).toBe(true)
    expect(c.groups.has('nope')).toBe(false)
  })

  it('delete() removes the group and returns the outcome', async () => {
    const c = await setup()
    c.createGroup('g', [])
    expect(await c.groups.delete('g')).toBe(true)
    expect(c.groups.has('g')).toBe(false)
    expect(await c.groups.delete('g')).toBe(false)
  })

  it('create() rejects duplicate names', async () => {
    const c = await setup()
    c.groups.create('g', [])
    expect(() => c.groups.create('g', [])).toThrow(TvError)
  })

  it('is iterable with for..of', async () => {
    const c = await setup()
    c.createGroup('a', [])
    c.createGroup('b', [])
    c.createGroup('c', [])

    const names: string[] = []
    for (const g of c.groups) {
      expect(g).toBeInstanceOf(Group)
      names.push(g.name)
    }
    expect(new Set(names)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('cleans up all groups on client.disconnect()', async () => {
    const c = await setup()
    c.createGroup('a', [])
    c.createGroup('b', [])
    expect(c.groups.size).toBe(2)

    await c.disconnect()
    client = null
    expect(c.groups.size).toBe(0)
  })
})
