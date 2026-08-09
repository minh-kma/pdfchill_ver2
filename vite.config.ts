import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` is read back at runtime by shared/lib/routes.ts via import.meta.env.BASE_URL,
// so a subfolder deploy only needs this one value changed.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  // The compress worker dynamically imports pdf-lib and qpdf-wasm, so it is a code-splitting
  // build — which rules out the default IIFE worker format. Dropping this breaks `vite build`
  // with: Invalid value "iife" for option "worker.format".
  worker: { format: 'es' },

  // Dev-only: exposes the Vite server for a Cloudflare tunnel (`cloudflared --url`).
  // Has no effect on `vite build`.
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
  },
});
