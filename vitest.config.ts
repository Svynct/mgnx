import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Coverage is enforced on logic modules (stores + pure helpers), where the
      // testable business logic lives. Presentational components, the App shell,
      // and Tauri-event hooks are exercised manually, not via jsdom unit tests.
      include: ['src/stores/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/test/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
