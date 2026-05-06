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
  // and coordinates — they only need to fill in financial data.
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
    create(s);
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
    const data = s
      ? { exportedAt: new Date().toISOString(), version: VER, study: s }
      : { exportedAt: new Date().toISOString(), version: VER, studies };
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
  }

  function importStudy(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        const arr = d.studies || (d.study ? [d.study] : null);
        if (!arr) {
          pushToast('Invalid study file — missing "study" or "studies" key.', { kind: 'err' });
          return;
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
        e.target.value = '';
      } catch (err) {
        console.error(err);
        pushToast('Could not parse file. Expected a JSON file exported from this tool.', { kind: 'err' });
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
            ? <Workspace study={active} onUpdate={update} onDelete={del} />
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
