/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The validated question bank and schemas ship in the main bundle (~160 kB gzipped total).
  build: { chunkSizeWarningLimit: 700 },
  server: {
    // During local development, `npm run dev:api` (wrangler) serves /api on 8788.
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  // `vite preview` serves the static build only; without an API the app falls back to local feedback.
  preview: { proxy: {} },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
    restoreMocks: true,
  },
});
