import { fmt } from '../lib/calc.js';

export function Sidebar({ studies, activeId, onSelect, onCreate, onImportFile, onExport, onHome }) {
  return (
    <nav className="sb no-print">
      <div className="sb-hd">
        <div className="sb-lb">Rate Studies</div>
        <button className="btn b-lime btn-fw" onClick={onCreate}>+ New Study</button>
        <button
          className="btn b-ghost btn-sm btn-fw"
          style={{ marginTop: 6 }}
          onClick={onHome}
          disabled={!activeId}
        >
          ⌂ Dashboard
        </button>
      </div>
      <div className="sb-ls">
        {studies.length === 0
          ? <div className="sb-em">No studies yet.<br />Create one to begin.</div>
          : studies.map(s => (
            <div
              key={s.id}
              className={'sb-it' + (s.id === activeId ? ' on' : '')}
              onClick={() => onSelect(s.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                <div className="sb-nm" style={{ flex: 1 }}>{s.name}</div>
                <span
                  className={'badge ' + (s.status === 'complete' ? 'bc' : s.status === 'in-progress' ? 'bp' : 'bd')}
                  style={{ flexShrink: 0 }}
                >
                  {s.status === 'complete' ? 'done' : s.status === 'in-progress' ? 'active' : 'draft'}
                </span>
              </div>
              <div className="sb-sb">{s.systemInfo?.systemName || 'No system assigned'}</div>
              {s.systemInfo?.county && <div className="sb-sb">{s.systemInfo.county} County</div>}
              <div className="sb-dt">Updated {fmt.short(s.updatedAt)}</div>
            </div>
          ))}
      </div>
      <div className="sb-ft">
        <div className="sb-lb" style={{ marginBottom: 7 }}>File</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn b-ghost btn-sm" onClick={onImportFile}>↑ Import Study (.json)</button>
          {activeId && <button className="btn b-ghost btn-sm" onClick={() => onExport(activeId)}>↓ Export Study (.json)</button>}
          {studies.length > 1 && <button className="btn b-ghost btn-sm" onClick={() => onExport(null)}>↓ Export All</button>}
        </div>
      </div>
    </nav>
  );
}
