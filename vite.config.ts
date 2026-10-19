/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The question bank is large and changes on a different schedule from the app code, so it gets its own
    // chunk: browsers download both in parallel, and editing questions does not invalidate the cached app.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'questions', test: /[\\/]src[\\/]data[\\/]questions[\\/]/ }] },
      },
    },
  },
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
