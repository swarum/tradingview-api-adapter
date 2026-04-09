# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 0: V2 repository setup — dual ESM/CJS build via `tsup`, `vitest` test
  runner, ESLint 9 flat config, Prettier, CI workflow, `engines: node >=20`.
- Security: upgraded `ws` to `^8.18.0` (fixes GHSA-3h5v-q93c-6h6q).
- `tradingview-api-adapter/internal` subpath export for advanced users.

### Removed

- Legacy 1.x source code (`src/Client.ts`, `src/Quote.ts`, `src/QuoteChannel.ts`,
  `src/TickerDetails.ts`, `src/WsProtocol.ts`, `src/adapters/*`, `demos/*`).
  Will be replaced by the new architecture across phases 1–6. See
  `docs/MIGRATION.md` for the 1.x → 2.0 migration guide.
