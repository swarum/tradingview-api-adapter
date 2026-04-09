/**
 * Convert `kebab-case` and `snake_case` strings to `camelCase`.
 *
 * TradingView's wire format mixes both conventions: `series-key`,
 * `base_name`, `session-regular-display`, `is_tradable`, etc. Our
 * public API exposes everything as camelCase — this helper is the
 * single conversion point.
 *
 * Examples:
 *   kebabToCamel('series-key')             → 'seriesKey'
 *   kebabToCamel('base_name')              → 'baseName'
 *   kebabToCamel('session-regular-display') → 'sessionRegularDisplay'
 *   kebabToCamel('is_tradable')            → 'isTradable'
 *   kebabToCamel('has-no-bbo')             → 'hasNoBbo'
 *
 * Edge behaviour:
 *   - Already-camelCase strings pass through unchanged.
 *   - Numeric segments are kept: `rt-lag` → `rtLag`, `price_52_week_high` → `price52WeekHigh`.
 *   - Leading separators are preserved (`-foo` → `-foo`, unlikely to appear in TV payloads).
 *   - Consecutive separators collapse: `a--b` → `aB`.
 */
export function kebabToCamel(key: string): string {
  if (key.length === 0) return key
  return key.replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Shallow-transform the top-level keys of an object from kebab/snake to
 * camelCase. Values are passed through unchanged — nested objects keep
 * their original key casing, because TradingView nests things like
 * `local_popularity: { US: 123, DE: 45 }` where the inner keys are
 * country codes and must NOT be lowercased.
 *
 * If you need recursive transformation, do it explicitly at each level
 * where it makes sense.
 */
export function transformKeys<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    out[kebabToCamel(key)] = value
  }
  return out as T
}
