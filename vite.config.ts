import { defineConfig } from 'vite';
export default defineConfig({
  root: 'battle',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  server: { port: 4173, strictPort: true },
});
