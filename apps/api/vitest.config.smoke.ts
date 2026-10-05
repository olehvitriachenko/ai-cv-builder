import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Manual smoke test against the REAL Anthropic API. Never part of `test` or `test:e2e`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/smoke/**/*.smoke.ts'],
    setupFiles: ['./test/smoke/setup-smoke.ts'],
    testTimeout: 5 * 60_000,
    hookTimeout: 30_000,
  },
});
