import { useState, useEffect, useRef } from 'react';
import { VER } from './lib/constants.js';
import { loadDB, saveDB } from './lib/state.js';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Workspace } from './components/Workspace.jsx';
import { NewStudyModal } from './components/NewStudyModal.jsx';

export default function App() {
  const [studies, setStudies] = useState(() => loadDB());
  const [activeId, setActiveId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const fileRef = useRef(null);
  const active = studies.find(s => s.id === activeId) || null;

  useEffect(() => saveDB(studies), [studies]);

  const create = (s) => {
    setStudies(p => [s, ...p]);
    setActiveId(s.id);
    setShowNew(false);
  };
  const update = (s) => setStudies(p => p.map(x => x.id === s.id ? s : x));
  const del = (id) => {
    setStudies(p => p.filter(x => x.id !== id));
    if (activeId === id) setActiveId(null);
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
    a.download = `wrs-${safe}-${new Date().getFullYear()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importStudy(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        const arr = d.studies || (d.study ? [d.study] : null);
        if (!arr) { alert('Invalid study file.'); return; }
        const imp = arr.map(s => ({
          ...s,
          id: crypto.randomUUID(),
          name: s.name + ' (Imported)',
          updatedAt: new Date().toISOString()
        }));
        setStudies(p => [...imp, ...p]);
        if (imp.length > 0) setActiveId(imp[0].id);
        e.target.value = '';
      } catch {
        alert('Could not parse file.');
      }
    };
    r.readAsText(file);
  }

  return (
    <>
      <Header />
      <div className="row">
        <Sidebar
          studies={studies}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => setShowNew(true)}
          onImportFile={() => fileRef.current?.click()}
          onExport={exportStudy}
          onHome={() => setActiveId(null)}
        />
        <main className="main">
          {active
            ? <Workspace study={active} onUpdate={update} onDelete={del} />
            : <Dashboard studies={studies} onSelect={setActiveId} onCreate={() => setShowNew(true)} />
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
    </>
  );
}
