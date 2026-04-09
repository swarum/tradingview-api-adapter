/**
 * Debug logging wrapper.
 *
 * Usage:
 *   const log = createLogger('transport')
 *   log('connect() → %s', url)
 *
 * Enable at runtime via the `DEBUG` environment variable:
 *   DEBUG=tradingview-adapter:*              (all namespaces)
 *   DEBUG=tradingview-adapter:transport      (one namespace)
 *   DEBUG=tradingview-adapter:transport,tradingview-adapter:protocol
 */

import debug from 'debug'

const ROOT_NAMESPACE = 'tradingview-adapter'

export type Logger = debug.Debugger

export function createLogger(namespace: string): Logger {
  return debug(`${ROOT_NAMESPACE}:${namespace}`)
}
