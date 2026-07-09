import { fmt } from '../lib/calc.js';
import { statusMeta } from '../lib/status.js';
import { ENGINEERS_LIST_URL, ENGINEERS_LIST_UPDATED } from '../lib/constants.js';

export function Sidebar({ studies, activeId, onSelect, onCreate, onImportFile, onExport, onHome, mobileOpen }) {
  return (
    <nav className={'sb no-print' + (mobileOpen ? ' open' : '')}>
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
            <button
              type="button"
              key={s.id}
              className={'sb-it' + (s.id === activeId ? ' on' : '')}
              onClick={() => onSelect(s.id)}
              aria-current={s.id === activeId ? 'true' : undefined}
              aria-label={`Open ${s.name}${s.systemInfo?.systemName ? ', ' + s.systemInfo.systemName : ''}, status ${statusMeta(s.status).label}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                <div className="sb-nm" style={{ flex: 1, textAlign: 'left' }}>{s.name}</div>
                <span
                  className={'badge ' + statusMeta(s.status).sidebarClass}
                  style={{ flexShrink: 0 }}
                >
                  {statusMeta(s.status).label}
                </span>
              </div>
              <div className="sb-sb" style={{ textAlign: 'left' }}>{s.systemInfo?.systemName || 'No system assigned'}</div>
              {s.systemInfo?.county && <div className="sb-sb" style={{ textAlign: 'left' }}>{s.systemInfo.county} County</div>}
              <div className="sb-dt" style={{ textAlign: 'left' }}>Updated {fmt.short(s.updatedAt)}</div>
            </button>
          ))}
      </div>
      <div className="sb-ft">
        <div className="sb-lb" style={{ marginBottom: 7 }}>File</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn b-ghost btn-sm" onClick={onImportFile}>↑ Import Study (.json)</button>
          {activeId && <button className="btn b-ghost btn-sm" onClick={() => onExport(activeId)}>↓ Export Study (.json)</button>}
          {studies.length > 1 && <button className="btn b-ghost btn-sm" onClick={() => onExport(null)}>↓ Export All</button>}
        </div>
        <div className="sb-lb" style={{ marginTop: 14, marginBottom: 7 }}>Resources</div>
        {ENGINEERS_LIST_URL ? (
          <a
            className="btn b-ghost btn-sm btn-fw"
            href={ENGINEERS_LIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            📋 Approved Engineers List
            {ENGINEERS_LIST_UPDATED && <span style={{ display: 'block', fontSize: 9, opacity: .7, marginTop: 1 }}>Updated {ENGINEERS_LIST_UPDATED}</span>}
          </a>
        ) : (
          <div
            className="btn b-ghost btn-sm btn-fw"
            title="No link configured yet — set VITE_ENGINEERS_LIST_URL when the current list is available."
            style={{ opacity: .55, cursor: 'default', textAlign: 'center' }}
          >
            📋 Approved Engineers List — pending
          </div>
        )}
      </div>
    </nav>
  );
}
