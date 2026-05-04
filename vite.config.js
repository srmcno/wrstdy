import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`         → standard chunked output in dist/ (deployable to any web host)
// `npm run build:single`  → one self-contained dist/index.html you can email or open via file://
const single = process.env.VITE_SINGLEFILE === '1';

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  server: { port: 5173, host: true },
  build: single
    ? {
        // Inline every asset (including the 140KB seal) into the HTML
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : {},
});
