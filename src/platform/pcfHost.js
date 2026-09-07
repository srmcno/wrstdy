// Power Apps component framework host.
//
// Inside a canvas app the component owns no storage and reaches no network of
// its own. Three framework rules shape everything here:
//
//   * "Code components should not use the HTML web storage objects, like
//     window.localStorage and window.sessionStorage, to store data."
//   * "Custom auth in code components is not supported in Power Apps canvas
//     applications. Use connectors to get data and take actions instead."
//   * "Dataverse dependent APIs, including WebAPI, are not available for
//     Power Apps canvas applications yet."
//     — learn.microsoft.com/power-apps/developer/component-framework/limitations
//
// So: studies arrive as an input property and leave through
// notifyOutputChanged; generated PDFs/Word files leave the same way as base64
// for the canvas app to write into a SharePoint document library; and AI calls
// are requests the canvas app fulfils with a Power Automate flow. Per-device
// settings (text size) live in memory for the session only.

// A `Multiple` text property holds up to 1,048,576 characters. Base64 inflates
// bytes by 4/3, so anything past ~780 KB of file cannot round-trip through a
// text output property. Report PDFs land well inside that; a study with an
// unusually large embedded analysis might not, and silently truncating would
// hand the user a corrupt document.
export const MAX_TEXT_PROPERTY_CHARS = 1_048_576;
export const MAX_FILE_BYTES = Math.floor((MAX_TEXT_PROPERTY_CHARS * 3) / 4) - 1024;

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Chunked so a multi-hundred-KB file doesn't blow the argument limit of
  // String.fromCharCode (which throws "too many arguments" past ~100k).
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * Build the host object the app runs against inside Power Apps.
 *
 * @param {Object} bridge wiring supplied by the PCF control wrapper
 * @param {() => any[]} bridge.readStudies        current studies from the input property
 * @param {(studies:any[]) => void} bridge.writeStudies  queue studies as an output + notify
 * @param {(file:Object) => void} bridge.emitFile queue a generated file as an output + notify
 * @param {(payload:Object) => Promise<any>} [bridge.requestAi] ask the canvas app for an analysis
 * @param {boolean} [bridge.multiStudy] true when the control edits a library of studies
 */
export function createPowerAppsHost(bridge) {
  // Per-session only: the framework forbids web storage, and a canvas app can
  // persist a real preference itself (a user-settings list, a Power Apps user
  // variable) if the team wants text size to stick.
  const settings = new Map();
  const subscribers = new Set();

  return {
    name: 'pcf',
    capabilities: {
      // Power Apps owns persistence; the app must not also write localStorage.
      localPersistence: false,
      // Canvas apps sandbox the component; a blob download from inside it is
      // unreliable, so files are handed to the app instead.
      fileDownload: false,
      filePicker: false,
      // Printing would target the host page, not the report.
      print: false,
      // No key ever enters the component; analyses go through the app's flow.
      directAi: false,
      multiStudy: Boolean(bridge.multiStudy),
      settings: true,
    },

    loadStudies: () => bridge.readStudies(),
    saveStudies: (studies) => {
      if (JSON.stringify(studies).length > MAX_TEXT_PROPERTY_CHARS) throw new Error('Study exceeds the Power Apps text payload limit. Shorten analysis history or use single-study mode.');
      bridge.writeStudies(studies);
    },

    // The wrapper calls the returned pushStudies() when Power Apps sends a
    // different StudiesJson (a different SharePoint item selected, a refresh
    // after someone else saved).
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    _push(studies) { for (const fn of subscribers) { try { fn(studies); } catch (e) { console.error(e); } } },

    async deliverFile({ filename, mimeType, bytes, text, kind, studyId }) {
      const payloadBytes = bytes
        ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
        : null;
      const size = payloadBytes ? payloadBytes.byteLength : new TextEncoder().encode(text ?? '').byteLength;
      if (size > MAX_FILE_BYTES) {
        return {
          ok: false,
          message: `${filename} is ${(size / 1024 / 1024).toFixed(1)} MB — too large to pass to Power Apps in one property (limit ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MB). Trim the AI analysis or report notes and export again.`,
        };
      }
      bridge.emitFile({
        filename,
        mimeType: mimeType || 'application/octet-stream',
        base64: payloadBytes ? bytesToBase64(payloadBytes) : textToBase64(text ?? ''),
        sizeBytes: size,
        kind: kind || 'file',
        studyId: studyId || null,
      });
      return {
        ok: true,
        message: `${filename} has been sent to Power Apps. Confirm the host reports a successful file save.`,
      };
    },

    print() { /* no-op: see capabilities.print */ },

    requestAi: typeof bridge.requestAi === 'function' ? bridge.requestAi : undefined,

    getSetting: (k) => (settings.has(k) ? settings.get(k) : null),
    setSetting: (k, v) => {
      if (v == null || v === '') settings.delete(k); else settings.set(k, String(v));
      return true;
    },
  };
}

/**
 * Parse the StudiesJson input property. Accepts three shapes so app makers can
 * bind whatever their data source hands them without a formula in between:
 *   - an array of studies
 *   - a single study object
 *   - an export envelope: { study } or { studies }
 * Anything unparseable yields an empty library rather than a crashed control.
 */
export function parseStudiesJson(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(s => s && typeof s === 'object');
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.studies)) return parsed.studies.filter(s => s && typeof s === 'object');
      if (parsed.study && typeof parsed.study === 'object') return [parsed.study];
      return [parsed];
    }
    return [];
  } catch (err) {
    console.error('StudiesJson could not be parsed', err);
    return [];
  }
}
