import { useState, useEffect, useRef } from 'react';
import { VER } from './lib/constants.js';
import { loadDB, saveDB, onSaveStatus, newStudy, normalizeStudy } from './lib/state.js';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Workspace } from './components/Workspace.jsx';
import { NewStudyModal } from './components/NewStudyModal.jsx';
import { ToastHost, pushToast } from './components/Toasts.jsx';

export default function App() {
  const [studies, setStudies] = useState(() => loadDB());
  const [activeId, setActiveId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileRef = useRef(null);
  const active = studies.find(s => s.id === activeId) || null;

  // Curly braces matter: the arrow must return undefined, not saveDB's
  // boolean. React treats any non-undefined return as the effect's cleanup
  // and tries to call it on the next run — `true()` throws and surfaces as
  // an ErrorBoundary on every state change.
  useEffect(() => { saveDB(studies); }, [studies]);

  // Surface localStorage failures (quota exceeded, opaque origin, disabled
  // storage) so users know their work didn't persist.
  useEffect(() => {
    let warned = false;
    return onSaveStatus((status, err) => {
      if (status === 'error' && !warned) {
        warned = true;
        pushToast(
          'Could not save changes — browser storage is full or disabled. Use "Export Study" to back up your work.',
          { kind: 'err', duration: 0 },
        );
        console.error('saveDB failed', err);
      }
      if (status === 'ok') warned = false;
    });
  }, []);

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
        ? { ...x, ...patch, updatedAt: new Date().toISOString() }
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

  function exportStudy(id) {
    const s = id ? studies.find(x => x.id === id) : null;
    const exportedAt = new Date().toISOString();
    const data = s
      ? { exportedAt, version: VER, study: s }
      : { exportedAt, version: VER, studies };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (s?.systemInfo?.systemName || s?.name || 'all-studies').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `wrs-${safe}-${new Date().getFullYear()}.json`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Exported ${filename}`);
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
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        const rawArr = Array.isArray(d.studies) ? d.studies : (d.study && typeof d.study === 'object' ? [d.study] : null);
        const arr = rawArr?.filter(s => s && typeof s === 'object');
        if (!arr || arr.length === 0) {
          pushToast('Invalid study file — expected a "study" object or "studies" array exported from this tool.', { kind: 'err' });
          return;
        }
        // Numeric semver comparison — string comparison mis-orders versions
        // like "2.10.0" vs "2.2.0".
        const isNewer = (a, b) => {
          const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
          const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
          }
          return false;
        };
        if (d.version && isNewer(d.version, VER)) {
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

  return (
    <>
      <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div className="row">
        <div className={'sb-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
        <Sidebar
          studies={studies}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => setShowNew(true)}
          onImportFile={() => fileRef.current?.click()}
          onExport={exportStudy}
          onHome={() => setActiveId(null)}
          mobileOpen={sidebarOpen}
        />
        <main className="main">
          {active
            /* key: reset the step tabs (and other per-study UI state) when
               switching studies, so opening a different study doesn't land on
               whatever step the previous one was showing. */
            ? <Workspace key={active.id} study={active} onUpdate={update} onDelete={del} onExport={exportStudy} />
            : <Dashboard studies={studies} onSelect={setActiveId} onCreate={() => setShowNew(true)} onLoadSample={create} onCreateFromKnown={createFromKnown} />
          }
        </main>
      </div>
      {showNew && <NewStudyModal onClose={() => setShowNew(false)} onCreate={create} />}
      <input
        type="file"
        ref={fileRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={importStudy}
      />
      <ToastHost />
    </>
  );
}
