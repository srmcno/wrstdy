import { useState, useEffect, useRef, useCallback } from 'react';
import { VER } from './lib/constants.js';
import { loadDB, saveDB, onSaveStatus, newStudy, normalizeStudy, resolvePatch } from './lib/state.js';
import { getHost, can, deliverFile } from './platform/host.js';
import { safeFileName } from './lib/exporters/data.js';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Workspace } from './components/Workspace.jsx';
import { NewStudyModal } from './components/NewStudyModal.jsx';
import { ToastHost, pushToast } from './components/Toasts.jsx';
import { useContainerSize } from './components/useContainerSize.js';
import { useTextZoom } from './components/TextSizeMenu.jsx';

// Writes are batched: a keystroke in a budget field would otherwise mean a
// full localStorage serialize (standalone) or a notifyOutputChanged round trip
// to Power Apps (code component) per character. 400ms is below the threshold
// where a user could navigate away between typing and the flush, and every
// exit path below force-flushes anyway.
const SAVE_DEBOUNCE_MS = 400;

// Numeric semver comparison — string comparison mis-orders versions like
// "2.10.0" vs "2.2.0".
const isNewerVersion = (a, b) => {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

export default function App() {
  const host = getHost();
  const [studies, setStudies] = useState(() => loadDB());
  // In single-study hosts (a code component bound to one SharePoint item) the
  // one study is always open; there is no dashboard or study list to return to.
  const singleStudyHost = !can('multiStudy');
  // Single-study hosts need no selection state: `active` below falls through
  // to the only study there is.
  const [activeId, setActiveId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileRef = useRef(null);
  const rootRef = useRef(null);
  const { narrow, xnarrow } = useContainerSize(rootRef);
  const zoom = useTextZoom();
  // CSS `zoom` scales the rendered box, so a zoomed element sized at 100% of
  // its parent overflows by exactly the zoom factor. Shrinking the layout box
  // by 1/zoom makes the scaled result fill the container again — which is what
  // keeps the internal scroll regions (and the sticky nav bar) correct at
  // every text size.
  const zoomStyle = zoom === 1
    ? undefined
    : { zoom, width: `calc(100% / ${zoom})`, height: `calc(100% / ${zoom})` };
  const active = studies.find(s => s.id === activeId) || (singleStudyHost ? studies[0] || null : null);

  // ── Persistence ───────────────────────────────────────────────────────────
  // A ref mirrors the latest studies so the flush paths (unmount, tab hide,
  // page unload) always write the newest value rather than a stale closure.
  const latestRef = useRef(studies);
  latestRef.current = studies;
  const saveTimerRef = useRef(null);
  const dirtyRef = useRef(false);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    saveDB(latestRef.current);
  }, []);

  useEffect(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [studies, flushSave]);

  // Force a write before the app can disappear. `visibilitychange` covers the
  // mobile/tab-switch case that `beforeunload` misses on iOS and Android.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushSave(); };
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flushSave);
      document.removeEventListener('visibilitychange', onHide);
      flushSave();
    };
  }, [flushSave]);

  // Surface persistence failures (quota exceeded, opaque origin, disabled
  // storage, a rejected Power Apps write) so users know work didn't persist.
  useEffect(() => {
    let warned = false;
    return onSaveStatus((status, err) => {
      if (status === 'error' && !warned) {
        warned = true;
        pushToast(
          can('localPersistence')
            ? 'Could not save changes — browser storage is full or disabled. Use "Export Study" to back up your work.'
            : 'Could not save changes back to the host application. Copy anything unsaved before closing this screen.',
          { kind: 'err', duration: 0 },
        );
        console.error('saveDB failed', err);
      }
      if (status === 'ok') warned = false;
    });
  }, []);

  // Studies pushed in from outside (the canvas app loading a different
  // SharePoint item, or a refresh after someone else saved). Replaces local
  // state wholesale — the host is authoritative when it speaks.
  useEffect(() => {
    if (typeof host.subscribe !== 'function') return;
    return host.subscribe((incoming) => {
      if (!Array.isArray(incoming)) return;
      flushSave();
      const normalized = incoming.map(normalizeStudy);
      dirtyRef.current = false;
      setStudies(normalized);
      setActiveId(prev => {
        if (normalized.some(s => s.id === prev)) return prev;
        return singleStudyHost ? (normalized[0]?.id ?? null) : null;
      });
    });
  }, [host, flushSave, singleStudyHost]);

  // Close mobile sidebar when a study is selected
  useEffect(() => { setSidebarOpen(false); }, [activeId]);

  const create = (s) => {
    setStudies(p => [s, ...p]);
    setActiveId(s.id);
    setShowNew(false);
    pushToast(`Created "${s.name}"`);
  };

  // Spawn a new study pre-populated from a known PWS record (clicked on the
  // map). Saves the user from re-typing the system name, county, water source,
  // and coordinates — they only need to fill in financial data. The record is
  // flagged unverified: map/source data (especially supplier relationships)
  // can be stale or wrong, so Step 1 shows a review banner until staff confirm.
  const createFromKnown = (k) => {
    const s = newStudy(`${k.name} — Rate Study ${new Date().getFullYear()}`);
    s.systemInfo.systemName = k.name;
    s.systemInfo.county = k.county;
    s.systemInfo.address = k.address || '';
    s.systemInfo.latitude = k.lat;
    s.systemInfo.longitude = k.lng;
    s.systemInfo.waterBodySource = k.waterBody || '';
    if (k.sourceType) s.systemInfo.sourceType = k.sourceType;
    if (k.systemType) s.systemInfo.systemType = k.systemType;
    if (k.populationServed) s.systemInfo.populationServed = String(k.populationServed);
    s.systemInfo.importedFromMap = true;
    s.systemInfo.importVerified = false;
    create(s);
    pushToast('Pre-filled from map data — verify the system details (PWS ID, population, supplier/source) in Step 1 before relying on them.', { kind: 'warn', duration: 8000 });
  };

  // Update accepts EITHER (id, patch) or (study). The patch form merges
  // against the latest state — important for async work whose closures may
  // hold a stale study snapshot (e.g. AI requests in Step 7 that resolve
  // after the user has navigated away and edited other steps).
  const update = (idOrStudy, patch) => {
    if (typeof idOrStudy === 'string') {
      setStudies(p => p.map(x => x.id === idOrStudy
        // resolvePatch lets a patch value be a function of the current value,
        // so an async writer can merge into `systemInfo` rather than replace it
        // with a snapshot taken before its await.
        ? { ...x, ...resolvePatch(x, patch), updatedAt: new Date().toISOString() }
        : x));
    } else {
      setStudies(p => p.map(x => x.id === idOrStudy.id ? idOrStudy : x));
    }
  };
  const del = (id) => {
    const s = studies.find(x => x.id === id);
    setStudies(p => p.filter(x => x.id !== id));
    if (activeId === id) setActiveId(null);
    if (s) pushToast(`Deleted "${s.name}"`, { kind: 'warn' });
  };

  async function exportStudy(id) {
    const s = id ? studies.find(x => x.id === id) : null;
    if (id && !s) {
      pushToast('That study is no longer open — nothing was exported.', { kind: 'warn' });
      return;
    }
    const exportedAt = new Date().toISOString();
    const data = s
      ? { exportedAt, version: VER, study: s }
      : { exportedAt, version: VER, studies };
    const base = safeFileName(s?.systemInfo?.systemName || s?.name || 'all-studies');
    const filename = `wrs-${base}-${new Date().getFullYear()}.json`;
    const result = await deliverFile({
      filename,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
      kind: 'study-backup',
      studyId: s?.id || null,
    });
    pushToast(result.message, { kind: result.ok ? 'ok' : 'err' });
    if (!result.ok) return;
    // Export is a metadata action, not a content edit — write lastExportedAt
    // directly instead of going through update(), which would also bump
    // updatedAt to "now" and make it look like the study was just changed.
    // Export All backs up every study in the file, so every study's backup
    // reminder should clear, not just the single-study path's target.
    setStudies(p => p.map(x => (!s || x.id === s.id) ? { ...x, lastExportedAt: exportedAt } : x));
  }

  function importStudy(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const r = new FileReader();
    r.onerror = () => {
      pushToast('Could not read that file. Check that it is still on disk and try again.', { kind: 'err' });
      input.value = '';
    };
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        const rawArr = Array.isArray(d.studies) ? d.studies : (d.study && typeof d.study === 'object' ? [d.study] : null);
        const arr = rawArr?.filter(s => s && typeof s === 'object');
        if (!arr || arr.length === 0) {
          pushToast('Invalid study file — expected a "study" object or "studies" array exported from this tool.', { kind: 'err' });
          return;
        }
        if (d.version && isNewerVersion(d.version, VER)) {
          pushToast(`This file was exported by a newer version (${d.version}) of the tool — fields it added may be dropped.`, { kind: 'warn', duration: 8000 });
        }
        const imp = arr.map(s => normalizeStudy({
          ...s,
          id: undefined,
          name: (s.name || 'Rate Study') + ' (Imported)',
          updatedAt: new Date().toISOString(),
        }));
        setStudies(p => [...imp, ...p]);
        if (imp.length > 0) setActiveId(imp[0].id);
        pushToast(`Imported ${imp.length} stud${imp.length === 1 ? 'y' : 'ies'}`);
      } catch (err) {
        console.error(err);
        pushToast('Could not parse file. Expected a JSON file exported from this tool.', { kind: 'err' });
      } finally {
        // Reset even on failure so re-selecting the same file fires onChange again.
        input.value = '';
      }
    };
    r.readAsText(file);
  }

  const showChrome = !singleStudyHost;

  return (
    <div
      className={'wrs-app' + (narrow ? ' narrow' : '') + (xnarrow ? ' xnarrow' : '')}
      ref={rootRef}
      style={zoomStyle}
      data-wrs-root
    >
      {showChrome && <Header onMenuToggle={() => setSidebarOpen(o => !o)} />}
      <div className="row">
        {showChrome && (
          <>
            <div className={'sb-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
            <Sidebar
              studies={studies}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={() => setShowNew(true)}
              onImportFile={can('filePicker') ? () => fileRef.current?.click() : null}
              onExport={exportStudy}
              onHome={() => setActiveId(null)}
              mobileOpen={sidebarOpen}
            />
          </>
        )}
        <main className="main">
          {active
            /* key: reset the step tabs (and other per-study UI state) when
               switching studies, so opening a different study doesn't land on
               whatever step the previous one was showing. */
            ? <Workspace
                key={active.id}
                study={active}
                onUpdate={update}
                onDelete={singleStudyHost ? null : del}
                onExport={exportStudy}
              />
            : singleStudyHost
              ? <NoStudyBound onCreate={() => create(newStudy())} />
              : <Dashboard studies={studies} onSelect={setActiveId} onCreate={() => setShowNew(true)} onLoadSample={create} onCreateFromKnown={createFromKnown} />
          }
        </main>
      </div>
      {showNew && <NewStudyModal onClose={() => setShowNew(false)} onCreate={create} />}
      {can('filePicker') && (
        <input
          type="file"
          ref={fileRef}
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={importStudy}
        />
      )}
      <ToastHost />
    </div>
  );
}

// Single-study hosts (a code component bound to one SharePoint list item) can
// legitimately start with nothing bound — a brand-new record, or a gallery
// with no selection. Say so plainly instead of rendering an empty shell.
function NoStudyBound({ onCreate }) {
  return (
    <div className="dash-wrap">
      <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
        <div className="dash-empty">
          <div className="dash-empty-icon" style={{ opacity: .35 }}>💧</div>
          <div>
            <h2 style={{ fontSize: 17, color: 'var(--teal)', marginBottom: 8 }}>No rate study loaded</h2>
            <p style={{ color: 'var(--mid)', fontSize: 13, lineHeight: 1.6 }}>
              This screen edits one rate study at a time. Select a system in the list to load its
              study, or start a blank one below and save it to create the record.
            </p>
          </div>
          <button className="btn b-lime" onClick={onCreate}>+ Start a blank rate study</button>
        </div>
      </div>
    </div>
  );
}
