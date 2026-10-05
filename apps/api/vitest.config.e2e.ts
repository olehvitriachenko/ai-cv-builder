import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Lifecycle tests share rows in one database and background work is global (sweeps).
    fileParallelism: false,
    // Creates the <database>_test database and migrates it before any test runs.
    globalSetup: ['./test/global-setup.ts'],
    // Points DATABASE_URL at the test database before the app is imported.
    setupFiles: ['./test/setup-env.ts'],
  },
});
