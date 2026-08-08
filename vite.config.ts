import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` is read back at runtime by shared/lib/routes.ts via import.meta.env.BASE_URL,
// so a subfolder deploy only needs this one value changed.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
});

// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';
// import tailwindcss from '@tailwindcss/vite';

// export default defineConfig({
//   base: '/',
//   plugins: [react(), tailwindcss()],

//   server: {
//     host: '0.0.0.0',
//     port: 5173,
//     strictPort: true,
//     allowedHosts: ['.trycloudflare.com'],
//   },
// });