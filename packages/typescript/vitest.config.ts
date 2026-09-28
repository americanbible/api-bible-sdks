import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**'],
      // version.ts is generated from package.json by sync-version.mjs.
      exclude: ['src/version.ts'],
      // Thresholds set just below the measured baseline (vitest 4 / v8:
      // statements ~98.6%, lines ~99.5%, functions 100%, branches ~92.6%) — a
      // ratchet that blocks regressions without being arbitrary. Re-measure and
      // raise after large additions to coverage.
      thresholds: {
        lines: 98,
        functions: 97,
        branches: 90,
        statements: 98,
      },
    },
  },
});
