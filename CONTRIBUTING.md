# Contributing to tradingview-api-adapter

Thanks for your interest in contributing! This document describes the
development workflow, code conventions, and the quirks you need to know
before opening a pull request.

## Development setup

**Requirements:**

- Node.js **≥ 20** (we use `using` / `Symbol.asyncDispose` — Node 18 is EOL)
- npm (already ships with Node)

**Install:**

```bash
git clone https://github.com/swarum/tradingview-api-adapter.git
cd tradingview-api-adapter
npm install
```

**Verify your setup:**

```bash
npm run check
```

This runs typecheck + lint + format check + tests. If it passes on a
fresh clone, you're ready.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` — strict type check of `src/`, `tests/`, `examples/` |
| `npm run lint` | ESLint 9 flat config (`eslint.config.js`) |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Prettier auto-format all supported files |
| `npm run format:check` | Prettier check without modifying |
| `npm run test` | Vitest unit + integration tests, run-once |
| `npm run test:watch` | Vitest watch mode — use during development |
| `npm run test:coverage` | Vitest with coverage report (v8), fails if < 85% |
| `npm run test:e2e` | Live end-to-end tests against real TradingView (slow, gated) |
| `npm run build` | `tsup` — dual ESM + CJS build into `dist/` |
| `npm run build:watch` | Rebuild on file change |
| `npm run publint` | Validate package.json for npm publication correctness |
| `npm run check` | Everything above except build + publint (quick local gate) |

**Before opening a PR:** run `npm run check` and make sure it's green.

## Project layout

```
src/
  core/         # Transport, Protocol, SessionManager, Errors — semver-exempt internal primitives
  sessions/     # QuoteSession, ChartSession — TradingView session logic
  api/          # Public API: tv(), Client, Symbol, Group, Stream
  types/        # Shared TypeScript types (QuoteField, Candle, SymbolInfo, …)
  utils/        # Small utilities (logger, backoff, random-id, kebab-to-camel)
  index.ts      # Public entry — re-exports the stable API
  internal.ts   # Advanced-user entry — re-exports core primitives
tests/
  unit/         # Fast, offline tests (parser, backoff, utils, sessions)
  integration/  # Tests against an in-process mock WebSocket server
  e2e/          # Live tests against real TradingView (opt-in)
  fixtures/     # Mock WS server, recorded TV messages
  helpers/      # waitFor, sleep, etc.
examples/       # Runnable demos (npx tsx examples/NN-*.ts)
docs/           # API reference, guides, migration, protocol docs
```

## Code conventions

### The `.js` extension on relative imports is intentional

You will see this throughout the codebase:

```ts
import { TvProtocolError } from './errors.js'
import type { ProtocolMessage } from './protocol.types.js'
```

**The file on disk is `errors.ts`, not `errors.js`.** This is not a bug.

TypeScript 4.7+ requires you to write imports using the **emitted** file
extension, not the source extension, when targeting native Node ESM.
After the build, `dist/core/errors.js` is what actually exists and gets
loaded at runtime. The TypeScript compiler is smart enough to resolve
`./errors.js` back to `./errors.ts` during type checking.

This is the official pattern recommended by the TypeScript team. See:
<https://www.typescriptlang.org/docs/handbook/modules/reference.html#extensionless-relative-paths>

**Rules:**

- Always include `.js` on relative imports (`./`, `../`)
- Do **not** use extensions on bare package imports (`import debug from 'debug'`)
- Do **not** use `.ts` extensions — that's a different project style (Deno)
- Type-only imports follow the same rule: `import type { Foo } from './foo.js'`

### Dual ESM + CJS build

`tsup.config.ts` emits both formats. This means source code must:

- Use `import`/`export` (ESM syntax) — tsup down-compiles for CJS
- Not rely on `__dirname` / `require` / `module.exports` — use `import.meta.url` / top-level `import` instead
- Not use `.cjs` / `.mjs` extensions in source — always `.ts`
- Consider both formats when testing — run `npm run build` and manually try both entries if you touched public exports

### Composition, not inheritance

The legacy 1.x code had `Client extends WsProtocol extends EventEmitter`. V2
rejects this: each layer is its own class and is **composed** via
dependency injection.

```ts
// ✗ Don't do this
class MySession extends Transport { /* ... */ }

// ✓ Do this
class MySession {
  constructor(private readonly transport: Transport) {}
}
```

Reasons:
- Clean public API — users of `MySession` don't see transport internals
- Each layer is independently testable
- Easy to swap implementations (e.g., mock transport in tests)

### Pure functions for protocol / parsing

Anything that transforms data without I/O must be a **pure function**,
not a class. See `src/core/protocol.ts` for the reference style.

Reasons:
- Trivially unit-testable — no setup, no mocks
- Tree-shakeable — unused functions are dropped from consumer bundles
- Easy to reason about — no hidden state

### Logging via `debug`

Never `console.log`. Use the `createLogger(namespace)` helper:

```ts
import { createLogger } from '../utils/logger.js'

const log = createLogger('transport')
log('connect() → %s', url)
```

Namespaces follow `tradingview-adapter:<module>` convention:

- `tradingview-adapter:transport`
- `tradingview-adapter:protocol`
- `tradingview-adapter:session:quote`
- `tradingview-adapter:session:chart`
- `tradingview-adapter:client`
- `tradingview-adapter:stream`
- `tradingview-adapter:rate-limiter`

Users enable logging at runtime:

```bash
DEBUG=tradingview-adapter:* node app.js
DEBUG=tradingview-adapter:transport,tradingview-adapter:protocol node app.js
```

### Error hierarchy

All errors extend `TvError`. Use the most specific subclass that fits:

- `TvConnectionError` — WebSocket / transport problems
- `TvProtocolError` — malformed frames, invalid JSON, wrong length
- `TvSessionError` — quote/chart session-level failures
- `TvSymbolError` — symbol-specific problems (includes `symbol` field)
- `TvTimeoutError` — any operation exceeding its timeout (includes `timeoutMs`)

Always provide `cause` when wrapping an underlying error:

```ts
try {
  return JSON.parse(payload)
} catch (err) {
  throw new TvProtocolError('Invalid JSON payload', { cause: err })
}
```

### Formatting and linting

- **Prettier** runs over everything — see `.prettierrc`
  - 2-space indent, single quotes, no semicolons, 100 char line limit
- **ESLint 9 flat config** — see `eslint.config.js`
  - No `any` unless absolutely necessary (warning, not error)
  - Type-only imports must use `import type`
  - No `console.log` in `src/` or `tests/` (allowed in `examples/`)
  - Unused variables must be prefixed with `_` if kept

Run `npm run lint:fix && npm run format` to auto-fix most issues.

## Testing

### Unit tests (`tests/unit/`)

Fast, offline, no external dependencies. Cover pure logic:
- Parsers / encoders
- Utility functions
- State machines
- Error classes

Target: **90%+ coverage** on `src/core/` and `src/sessions/`.

Run: `npm test` or `npm run test:watch`

### Integration tests (`tests/integration/`)

Run against a local mock WebSocket server (`tests/fixtures/ws-server.ts`).
Test layer composition, lifecycle, reconnect, error propagation.

The mock server uses `terminate()` instead of `close()` to simulate network
drops — `close()` with reserved codes like 1006 is silently ignored by the
`ws` library.

### E2E tests (`tests/e2e/`)

Live tests against real TradingView WebSocket. Gated behind `LIVE_E2E=1`
environment variable.

```bash
npm run test:e2e
# or
LIVE_E2E=1 npx vitest run tests/e2e
```

These are:
- **Slow** (seconds per test, not milliseconds)
- **Flaky** (network, TradingView downtime)
- **Nightly in CI** — see `.github/workflows/e2e.yml`

Only run them when you're changing something that touches the actual TV
protocol wire format.

### Writing a new test

1. Pick the right folder (unit / integration / e2e)
2. Name it `*.test.ts`
3. Import from `../../src/<path>.js` (note the `.js`!)
4. For integration tests, use `startMockServer()` from `tests/fixtures/ws-server.ts`
5. Use `waitFor(() => condition, { timeout, message })` from `tests/helpers/wait-for.ts` for async assertions

**Watch out for timing races.** Don't poll state to observe fast transitions
(e.g., open → reconnecting → open). Hook into transport callbacks like
`onClose` or `onReconnect` to capture state changes synchronously.

## Commits and pull requests

- One PR per phase / feature. See `docs/V2-PLAN.md` for phase breakdown.
- Write clear, present-tense commit messages. No "fixed a bug" — say what
  the bug was.
- Reference issues with `#N` if applicable.
- **Do not** update `CHANGELOG.md` in feature commits — it's maintained
  separately during releases.
- Run `npm run check` before pushing. CI will run the same, so save
  yourself a red badge.

## Working on a specific phase

V2 is built in phases (see `docs/V2-PLAN.md` if you have access — it's a
local planning doc, not published):

- **Phase 0** ✅ Repo setup — done
- **Phase 1** ✅ Transport + Protocol + utils — done
- **Phase 2** Sessions + RateLimiter + SessionManager
- **Phase 3** Types (QuoteField, Candle, SymbolInfo)
- **Phase 4** Public API (Client, Symbol, Stream)
- **Phase 5** Portfolio + Group + GroupRegistry
- **Phase 6** Browser + Proxy + Auth
- **Phase 7** Docs + examples + release polish

If you're contributing to a phase, check the plan for the exact scope and
deliverables before starting.

## Reporting issues

Check <https://github.com/swarum/tradingview-api-adapter/issues> first —
there may already be an open issue.

For bugs, please include:
- Node version (`node --version`)
- Package version
- Minimal reproduction
- Relevant output from `DEBUG=tradingview-adapter:* your-script.js`
- Expected vs actual behaviour

## Questions?

Open a discussion at
<https://github.com/swarum/tradingview-api-adapter/discussions>.
