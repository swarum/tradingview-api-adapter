/**
 * GroupRegistry — the `Map`-like container for a `Client`'s groups.
 *
 * Accessible via `client.groups`. Supports lookup, iteration,
 * deletion, and presence checks. Creation goes through
 * `client.createGroup(name, pairs)` (delegated here) to ensure names
 * are unique per client.
 */

import { TvError } from '../core/errors.js'
import type { Client } from './client.js'
import { Group } from './group.js'

export class GroupRegistry {
  private readonly groups = new Map<string, Group>()

  constructor(private readonly client: Client) {}

  /** Create a new group. Throws if a group with the same name already exists. */
  create(name: string, pairs: readonly string[] = []): Group {
    if (this.groups.has(name)) {
      throw new TvError(`Group "${name}" already exists`)
    }
    const group = new Group(this.client, name, pairs)
    this.groups.set(name, group)
    return group
  }

  /** Retrieve a group by name. */
  get(name: string): Group | undefined {
    return this.groups.get(name)
  }

  /** Check whether a group exists. */
  has(name: string): boolean {
    return this.groups.has(name)
  }

  /** Delete a group by name. Returns `true` if it existed. */
  async delete(name: string): Promise<boolean> {
    const group = this.groups.get(name)
    if (!group) return false
    await group.delete()
    // group.delete() already calls _unregister, so the map entry is
    // gone — double-check for safety.
    this.groups.delete(name)
    return true
  }

  /** List of group names. */
  get list(): readonly string[] {
    return Array.from(this.groups.keys())
  }

  /** Number of groups. */
  get size(): number {
    return this.groups.size
  }

  /** Iterate over all groups. */
  [Symbol.iterator](): IterableIterator<Group> {
    return this.groups.values()
  }

  /** @internal — called from `Group.delete()` during self-unregistration. */
  _unregister(name: string): void {
    this.groups.delete(name)
  }

  /** @internal — called from `Client.disconnect()` to clean up all groups. */
  async _disposeAll(): Promise<void> {
    const all = Array.from(this.groups.values())
    this.groups.clear()
    for (const g of all) {
      try {
        await g.delete()
      } catch {
        /* ignore */
      }
    }
  }
}
