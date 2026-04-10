---
name: Bug report
about: Something isn't working as expected
title: ''
labels: bug
assignees: ''
---

## Describe the bug

A clear, concise description of what's broken.

## To reproduce

Steps or minimal code to trigger the bug:

```ts
import { tv } from 'tradingview-api-adapter'

const client = tv()
// …
```

## Expected behaviour

What you expected to happen.

## Actual behaviour

What actually happened (include error messages, stack traces, or screenshots).

## Environment

- Node version: `node --version`
- Package version: `npm ls tradingview-api-adapter`
- OS: (e.g. macOS 15, Ubuntu 24.04, Windows 11)
- Runtime: (Node / Bun / Deno / Browser)

## Debug output

Paste the relevant output from running with verbose logging:

```bash
DEBUG=tradingview-adapter:* node your-script.js
```

## Additional context

Anything else that might help — network conditions, proxy setup, auth configuration, etc.
