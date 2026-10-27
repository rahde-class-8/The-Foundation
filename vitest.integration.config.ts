import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Runs against the local Supabase stack (`npm run db:start`). Not part of `npm run check`.
export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./supabase/functions/_shared/core', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
