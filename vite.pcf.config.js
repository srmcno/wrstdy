import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

// Library build for the Power Apps code component.
//
// Output: pcf/WaterRateStudyTool/app/wrs-app.js — ONE ES module containing the
// React application, React itself, and every dependency, with the stylesheet
// carried as an inlined string (see src/pcf-entry.jsx). The PCF project's
// TypeScript `index.ts` imports that module; webpack then folds it into the
// single bundle.js the framework requires.
//
// `inlineDynamicImports` is the load-bearing option: the app lazy-loads the
// PDF exporter, the Word exporter, and Leaflet, and a code component has no
// way to serve extra chunks at runtime.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Swap the Leaflet map for a stub. It would otherwise drag Leaflet and
      // the ~790 KB Council Districts GeoJSON into the single component
      // bundle, to draw a map the canvas app renders natively.
      // `find` is matched against the import specifier as written (`./MapView.jsx`),
      // not the resolved absolute path — hence the leading `[./]` rather than a
      // full directory prefix. `MapView.pcf.jsx` does not match, so the stub
      // cannot alias itself into a loop.
      {
        find: /^(?:.*[/\\])?MapView\.jsx$/,
        replacement: path.resolve(here, 'src/components/MapView.pcf.jsx'),
      },
    ],
  },
  define: {
    // Vite only substitutes import.meta.env for its own known keys in library
    // mode; naming them explicitly keeps the AI/geocode configuration working
    // (they resolve to undefined in the component, which is correct — the
    // canvas app brokers both).
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'pcf/WaterRateStudyTool/app',
    emptyOutDir: true,
    // The framework's browser support baseline; also what pcf-scripts targets.
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: 'src/pcf-entry.jsx',
      formats: ['es'],
      fileName: () => 'wrs-app.js',
    },
    rollupOptions: {
      // Nothing is external: the component ships one self-contained bundle.
      external: [],
      output: {
        inlineDynamicImports: true,
        // Assets (the seal image) are inlined as data URLs by
        // assetsInlineLimit below, so no extra files should ever appear here.
        assetFileNames: 'assets/[name][extname]',
      },
    },
    // Inline every asset — the 139 KB seal included. A code component cannot
    // reference sibling files by relative URL at runtime.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
  },
});
