import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SymbolBatcher } from '../../src/core/rate-limiter.js'
import { sleep } from '../helpers/wait-for.js'

interface Recorder {
  addCalls: string[][]
  removeCalls: string[][]
}

function makeExecutor(): Recorder & {
  add: (symbols: string[]) => void
  remove: (symbols: string[]) => void
} {
  const addCalls: string[][] = []
  const removeCalls: string[][] = []
  return {
    addCalls,
    removeCalls,
    add: (s) => {
      addCalls.push([...s])
    },
    remove: (s) => {
      removeCalls.push([...s])
    },
  }
}

describe('SymbolBatcher', () => {
  let batcher: SymbolBatcher | null = null

  beforeEach(() => {
    batcher = null
  })

  afterEach(() => {
    batcher?.destroy()
    vi.useRealTimers()
  })

  describe('basic batching', () => {
    it('coalesces multiple adds inside one window into a single call', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('A')
      batcher.add('B')
      batcher.add('C')

      expect(exec.addCalls).toHaveLength(0)
      await batcher.flushNow()

      expect(exec.addCalls).toHaveLength(1)
      expect(new Set(exec.addCalls[0])).toEqual(new Set(['A', 'B', 'C']))
    })

    it('deduplicates repeated adds of the same symbol', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('X')
      batcher.add('X')
      batcher.add('X')
      await batcher.flushNow()

      expect(exec.addCalls[0]).toEqual(['X'])
    })

    it('separates adds and removes into their own executor calls', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('A')
      batcher.remove('B')
      await batcher.flushNow()

      expect(exec.addCalls[0]).toEqual(['A'])
      expect(exec.removeCalls[0]).toEqual(['B'])
    })

    it('flushes automatically after batchWindowMs', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 20, chunkSize: 100 })

      batcher.add('A')
      batcher.add('B')
      await sleep(60)

      expect(exec.addCalls).toHaveLength(1)
      expect(new Set(exec.addCalls[0])).toEqual(new Set(['A', 'B']))
    })
  })

  describe('cancel-within-window', () => {
    it('cancels a pending add when remove of the same symbol arrives', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('A')
      batcher.remove('A')
      await batcher.flushNow()

      expect(exec.addCalls).toHaveLength(0)
      expect(exec.removeCalls).toHaveLength(0)
    })

    it('cancels a pending remove when add of the same symbol arrives', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.remove('A')
      batcher.add('A')
      await batcher.flushNow()

      expect(exec.addCalls).toHaveLength(0)
      expect(exec.removeCalls).toHaveLength(0)
    })

    it('keeps unrelated operations when cancelling one symbol', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('A')
      batcher.add('B')
      batcher.remove('A') // cancels its own add
      batcher.add('C')
      await batcher.flushNow()

      expect(exec.addCalls).toHaveLength(1)
      expect(new Set(exec.addCalls[0])).toEqual(new Set(['B', 'C']))
      expect(exec.removeCalls).toHaveLength(0)
    })
  })

  describe('chunking', () => {
    it('splits large adds into chunks of chunkSize', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, {
        batchWindowMs: 1,
        chunkSize: 3,
        chunkIntervalMs: 0,
      })

      for (let i = 0; i < 10; i++) batcher.add(`S${i}`)
      await batcher.flushNow()

      expect(exec.addCalls.length).toBe(4)
      expect(exec.addCalls[0]!.length).toBe(3)
      expect(exec.addCalls[1]!.length).toBe(3)
      expect(exec.addCalls[2]!.length).toBe(3)
      expect(exec.addCalls[3]!.length).toBe(1)

      const flat = exec.addCalls.flat()
      expect(new Set(flat).size).toBe(10)
    })

    it('waits chunkIntervalMs between chunks', async () => {
      const exec = makeExecutor()
      const timestamps: number[] = []
      const instrumentedExec = {
        add: (s: string[]): void => {
          timestamps.push(Date.now())
          exec.add(s)
        },
        remove: exec.remove,
      }

      batcher = new SymbolBatcher(instrumentedExec, {
        batchWindowMs: 1,
        chunkSize: 2,
        chunkIntervalMs: 40,
      })

      for (let i = 0; i < 6; i++) batcher.add(`S${i}`)
      await batcher.flushNow()

      expect(exec.addCalls.length).toBe(3)
      expect(timestamps.length).toBe(3)
      // gap between chunks ~= 40ms (give some slack)
      expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(30)
      expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(30)
    })
  })

  describe('lifecycle', () => {
    it('pendingCount reflects queued ops', () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 1000, chunkSize: 100 })

      expect(batcher.pendingCount).toBe(0)
      batcher.add('A')
      expect(batcher.pendingCount).toBe(1)
      batcher.remove('B')
      expect(batcher.pendingCount).toBe(2)
      batcher.remove('A') // cancels pending add
      expect(batcher.pendingCount).toBe(1)
    })

    it('destroy drops pending ops and ignores subsequent calls', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      batcher.add('A')
      batcher.destroy()
      batcher.add('B')
      await sleep(60)

      expect(exec.addCalls).toHaveLength(0)
      expect(batcher.pendingCount).toBe(0)
    })

    it('flushNow is a no-op when nothing is pending', async () => {
      const exec = makeExecutor()
      batcher = new SymbolBatcher(exec, { batchWindowMs: 30, chunkSize: 100 })

      await batcher.flushNow()
      await batcher.flushNow()

      expect(exec.addCalls).toHaveLength(0)
      expect(exec.removeCalls).toHaveLength(0)
    })
  })
})
