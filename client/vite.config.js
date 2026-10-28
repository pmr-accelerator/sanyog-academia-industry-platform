import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API is proxied so the browser sees ONE origin (cookies + CSRF just work).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:4000', changeOrigin: false } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
