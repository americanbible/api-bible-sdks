import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // React hooks need a DOM; the TS SDK uses 'node'.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**'],
      // Thresholds set just below the measured baseline (vitest 4 / v8: statements
      // ~99.0%, lines ~99.4%, functions 100%, branches ~97.8%) — a ratchet that
      // blocks regressions without being arbitrary. Re-measure and raise after
      // large additions.
      thresholds: {
        lines: 98,
        functions: 97,
        branches: 90,
        statements: 98,
      },
    },
  },
});
