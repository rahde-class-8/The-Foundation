import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fromRoot('./src'),
      // Domain core shared with Edge Functions (ADR-0002).
      '@core': fromRoot('./supabase/functions/_shared/core'),
    },
  },
  build: {
    // The entry chunk is dominated by required libraries (react-dom, supabase-js, react-router, zod):
    // ~200 kB gzipped. Feature routes are lazy-loaded. Revisit in the Phase 5 performance review.
    chunkSizeWarningLimit: 750,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Placeholder client config so modules that create the Supabase client can load in tests.
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    include: [
      'src/**/*.test.{ts,tsx}',
      'supabase/functions/_shared/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['supabase/functions/_shared/core/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', 'src/components/ui/**', 'src/main.tsx'],
    },
  },
});
