import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev.html is the source entry. index.html at the repo root is the built,
// self-contained game (scripts/build-single.mjs writes it), so it isn't an input.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { open: '/dev.html' },
  build: { rollupOptions: { input: 'dev.html' } },
});
