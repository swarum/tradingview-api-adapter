import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Browser-env tests live under tests/unit/browser-*.test.ts and
    // run in happy-dom. Everything else runs in plain Node.
    environmentMatchGlobs: [['tests/unit/browser-*.test.ts', 'happy-dom']],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/index.ts', 'src/internal.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
})
