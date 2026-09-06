// Library entry point for the Power Apps code component.
//
// `npm run build:pcf` bundles this file (with React and every dependency
// inlined, and the stylesheet injected at mount) into a single ES module that
// the PCF project imports from its TypeScript `index.ts`. Keeping the React
// application out of the PCF webpack build means:
//
//   * the app keeps React 18 — the platform React library available to
//     "virtual" code components is 16.14/17.0.2, which cannot run useId,
//     useSyncExternalStore, or createRoot;
//   * `import()` code-splitting in the app (the PDF and Word exporters, the
//     Leaflet map) is inlined into one file, which is what the framework
//     requires — a code component ships exactly one bundle;
//   * the PCF project stays plain TypeScript with no JSX loader to configure.
//
// Deliberately does NOT import standalone.css: this is a component on someone
// else's page and has no business styling the document.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import styles from './styles.css?inline';
import { setHost } from './platform/host.js';
import { createPowerAppsHost, parseStudiesJson } from './platform/pcfHost.js';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

const STYLE_ID = 'wrs-pcf-styles';

// The stylesheet is injected once per document rather than per control, so two
// instances of the component on the same screen don't duplicate ~25 KB of CSS.
function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = styles;
  doc.head.appendChild(el);
}

/**
 * Mount the Water Rate Study Tool into a host-provided element.
 *
 * @param {HTMLElement} container element supplied by the framework
 * @param {Object} options
 * @param {string}  options.studiesJson    current value of the StudiesJson input property
 * @param {boolean} options.multiStudy     true for the full workspace (sidebar, dashboard, map)
 * @param {(studies:any[]) => void} options.onStudiesChanged
 * @param {(file:Object) => void}   options.onFileReady
 * @param {(payload:Object) => Promise<any>} [options.onAiRequest]
 * @returns {{ setStudiesJson(json:string): void, destroy(): void }}
 */
export function mountWaterRateStudy(container, options = {}) {
  ensureStyles(container.ownerDocument || document);

  // The framework's container has no intrinsic height, and the app's layout is
  // a full-height flex column. Filling the container here (the wrapper sets its
  // pixel height from allocatedHeight) is what keeps the internal scroll areas
  // working instead of the whole page growing.
  container.style.height = '100%';
  container.style.minHeight = '0';
  container.style.overflow = 'hidden';

  let studies = parseStudiesJson(options.studiesJson);
  // Two guards against a feedback loop with the host, because a canvas app can
  // send back either form of what it just received:
  //   lastSeenJson — the exact text last accepted from StudiesJson, so a screen
  //                  re-render that re-evaluates the same binding is a no-op.
  //   lastEmitted  — the structure we last sent out, so the app patching our
  //                  own StudiesJsonOut back in is recognised as our echo.
  // Without both, the app restarts mid-keystroke and the user loses the field
  // they were typing in.
  let lastSeenJson = typeof options.studiesJson === 'string' ? options.studiesJson : '';
  let lastEmitted = JSON.stringify(studies);

  const host = createPowerAppsHost({
    multiStudy: Boolean(options.multiStudy),
    readStudies: () => studies,
    writeStudies: (next) => {
      const serialized = JSON.stringify(next);
      // Opening a study runs it through normalizeStudy, which re-emits an
      // identical object on every subsequent open. Emitting that would patch
      // SharePoint and add a payload version every time somebody merely looked
      // at a study.
      if (serialized === lastEmitted) return;
      studies = next;
      lastEmitted = serialized;
      options.onStudiesChanged?.(next);
    },
    emitFile: (file) => options.onFileReady?.(file),
    requestAi: options.onAiRequest,
  });
  setHost(host);

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );

  return {
    /**
     * Called from updateView when Power Apps sends a new StudiesJson value.
     * @returns {boolean} true when the value was genuinely new and applied.
     */
    setStudiesJson(json) {
      const text = typeof json === 'string' ? json : '';
      if (text === lastSeenJson) return false;
      lastSeenJson = text;
      const incoming = parseStudiesJson(text);
      const serialized = JSON.stringify(incoming);
      if (serialized === lastEmitted) return false;
      studies = incoming;
      lastEmitted = serialized;
      host._push(incoming);
      return true;
    },
    destroy() {
      // Deferred: React 18 warns when a root is unmounted synchronously from
      // inside a lifecycle the framework may still be walking.
      const r = root;
      setTimeout(() => { try { r.unmount(); } catch (err) { console.error(err); } }, 0);
    },
  };
}

export { parseStudiesJson };
export default mountWaterRateStudy;
