import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`         → standard chunked output in dist/ (deployable to any web host)
// `npm run build:single`  → one self-contained dist/index.html you can email or open via file://
const single = process.env.VITE_SINGLEFILE === '1';

// When opened via file://, browsers treat the page as an opaque origin and
// refuse to execute `<script type="module" crossorigin>`. Strip those attrs
// so the IIFE bundle runs as a classic script — but classic inline scripts
// don't defer, so move them to the end of <body> after #root exists.
const fileUrlSafeScript = {
  name: 'file-url-safe-script',
  enforce: 'post',
  transformIndexHtml(html) {
    let cleaned = html
      .replace(/<script\s+type="module"\s+crossorigin\b/g, '<script')
      .replace(/<script\s+type="module"\b/g, '<script')
      .replace(/<script\s+crossorigin\b/g, '<script');

    // Pull every <script>...</script> out of <head> and append before </body>
    const scripts = [];
    cleaned = cleaned.replace(
      /<head>([\s\S]*?)<\/head>/,
      (_m, head) => {
        const stripped = head.replace(/<script\b[^>]*>[\s\S]*?<\/script>\s*/g, (s) => {
          scripts.push(s.trim());
          return '';
        });
        return `<head>${stripped}</head>`;
      }
    );
    if (scripts.length) {
      cleaned = cleaned.replace('</body>', scripts.join('\n') + '\n</body>');
    }
    return cleaned;
  },
};

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile(), fileUrlSafeScript] : [])],
  server: { port: 5173, host: true },
  build: single
    ? {
        // Inline every asset (including the 140KB seal) into the HTML
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
        // Build a classic IIFE script with no `crossorigin` so the file
        // works when opened directly via file:// (Chrome/Edge/Safari treat
        // file:// as an opaque origin and block <script type="module">).
        target: 'es2019',
        modulePreload: { polyfill: false },
        rollupOptions: {
          output: {
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: '[name].js',
          },
        },
      }
    : {},
});
