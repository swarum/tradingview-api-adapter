/**
 * Polls `condition` until it returns a truthy value, or rejects on timeout.
 *
 * Useful for asserting state transitions in the Transport tests without
 * sprinkling `setTimeout`s through the test bodies.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  {
    timeout = 1000,
    interval = 10,
    message,
  }: { timeout?: number; interval?: number; message?: string } = {},
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await condition()) return
    await sleep(interval)
  }
  throw new Error(message ?? `waitFor timed out after ${timeout}ms`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
