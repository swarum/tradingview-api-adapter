import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    // Split tests into two projects so node-env tests never accidentally
    // load happy-dom, and happy-dom-env tests never see node-only fixtures.
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/e2e/**/*.test.ts',
          ],
          exclude: ['tests/unit/browser-*.test.ts', 'node_modules', 'dist'],
        },
      },
      {
        test: {
          name: 'browser',
          environment: 'happy-dom',
          include: ['tests/unit/browser-*.test.ts'],
        },
      },
    ],
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
