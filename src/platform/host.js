// Host abstraction.
//
// The same React application ships in two very different containers:
//
//   web  — the standalone Vite build (dev server, static host, or the
//          single-file HTML). It owns its own persistence (localStorage),
//          downloads files through blob URLs, and prints through the browser.
//
//   pcf  — a Power Apps component framework code component embedded in a
//          canvas app. Here the *canvas app* owns persistence (SharePoint via
//          Patch), files are handed back to Power Apps to store in a document
//          library, and the framework explicitly forbids web storage and
//          custom auth inside the component:
//          https://learn.microsoft.com/power-apps/developer/component-framework/limitations
//
// Everything host-specific lives behind this interface so no step, component,
// or calculation has to know which container it is running in. The web host is
// the default; the PCF wrapper calls setHost() before mounting React.

/**
 * @typedef {Object} HostCapabilities
 * @property {boolean} localPersistence  Host stores studies itself (no Power Apps round trip).
 * @property {boolean} fileDownload      deliverFile() reaches the user's disk directly.
 * @property {boolean} filePicker        The host can open a local file picker (JSON import).
 * @property {boolean} print             window.print() produces a usable document.
 * @property {boolean} directAi          The app may call an AI endpoint itself.
 * @property {boolean} multiStudy        The host hands over a library of studies, not just one.
 * @property {boolean} settings          Per-device settings can be stored (text size, API key).
 */

/** @typedef {'ok'|'error'} SaveStatus */

const noop = () => {};

// ─── Web host (default) ──────────────────────────────────────────────────────

const SETTINGS_PREFIX = '';

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
};

// Anchor-based download. Three details matter and each one was a real failure:
//   1. Firefox ignores a click on an anchor that is not in the document.
//   2. Revoking the object URL in the same tick cancels the download in
//      Firefox and older Safari — defer it past the navigation.
//   3. The anchor must be removed afterwards or repeated exports accumulate
//      hidden nodes in the body.
function browserDownload({ filename, mimeType, blob, bytes, text }) {
  const payload = blob
    || (bytes ? new Blob([bytes], { type: mimeType || 'application/octet-stream' }) : null)
    || new Blob([text ?? ''], { type: mimeType || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(payload);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
  return { ok: true, message: `Downloaded ${filename}` };
}

export const webHost = {
  name: 'web',
  capabilities: {
    localPersistence: true,
    fileDownload: true,
    filePicker: true,
    print: true,
    directAi: true,
    multiStudy: true,
    settings: true,
  },
  // Persistence is implemented in lib/state.js for the web host (it owns the
  // storage key and the normalize-on-read migration); these two are the seam
  // the PCF host replaces.
  loadStudies: null,   // filled in by lib/state.js to avoid a circular import
  saveStudies: null,
  subscribe: () => noop,
  async deliverFile(file) { return browserDownload(file); },
  print() { window.print(); },
  requestAi: null,     // null → the app uses lib/ai.js directly
  getSetting: (k) => safeStorage.get(SETTINGS_PREFIX + k),
  setSetting: (k, v) => (v == null || v === '' ? safeStorage.del(SETTINGS_PREFIX + k) : safeStorage.set(SETTINGS_PREFIX + k, v)),
};

// ─── Active host ─────────────────────────────────────────────────────────────

let active = webHost;

/** Replace the active host. Call before rendering React. */
export function setHost(host) {
  active = { ...webHost, ...host, capabilities: { ...webHost.capabilities, ...(host?.capabilities || {}) } };
  return active;
}

export function getHost() { return active; }

/** Convenience: capability check that never throws on a partial host. */
export function can(capability) { return Boolean(active?.capabilities?.[capability]); }

/**
 * Hand a generated file to the host. Web downloads it; PCF passes it to the
 * canvas app (base64) so a Power Automate flow can file it in SharePoint.
 * Always resolves — callers show `message` to the user either way.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function deliverFile(file) {
  try {
    const result = await active.deliverFile(file);
    return result || { ok: true, message: `Exported ${file.filename}` };
  } catch (err) {
    console.error('deliverFile failed', err);
    return { ok: false, message: err?.message || String(err) };
  }
}

export function hostPrint() {
  if (typeof active.print === 'function') active.print();
}

export const getSetting = (k) => (active.getSetting ? active.getSetting(k) : null);
export const setSetting = (k, v) => (active.setSetting ? active.setSetting(k, v) : false);
