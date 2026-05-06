import { useState } from 'react';
import { fmt } from '../lib/calc.js';
import { MapView } from './MapView.jsx';
import { makeSampleStudy } from '../lib/sample-study.js';
import { statusMeta } from '../lib/status.js';

export function Dashboard({ studies, onSelect, onCreate, onLoadSample, onCreateFromKnown }) {
  const [view, setView] = useState('list'); // 'list' | 'map'
  const mappedCount = (studies || []).filter(s => s.systemInfo?.latitude != null).length;

  return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, color: 'var(--teal)', marginBottom: 6 }}>Water Rate Studies</h1>
          <p style={{ color: 'var(--mid)', lineHeight: 1.65, maxWidth: 620, fontSize: 13 }}>
            Plan water rates for Choctaw Nation public water systems. Capture system info, customer
            classes, and budget, then compare current vs. proposed rates and generate a board-ready
            report your council can act on — PDF and Word exports included.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={'sub-tab' + (view === 'list' ? ' on' : '')}
            onClick={() => setView('list')}
          >
            📋 Studies
          </button>
          <button
            className={'sub-tab' + (view === 'map' ? ' on' : '')}
            onClick={() => setView('map')}
          >
            🗺 Map
          </button>
        </div>
      </div>

      {studies.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 28px', maxWidth: 540, margin: '0 auto' }}>
          <div style={{ fontSize: 44, marginBottom: 16, opacity: .35 }}>💧</div>
          <h2 style={{ fontSize: 17, color: 'var(--teal)', marginBottom: 8 }}>No Rate Studies Yet</h2>
          <p style={{ color: 'var(--mid)', fontSize: 13, marginBottom: 22, lineHeight: 1.6 }}>
            Create a new study to begin, or load a sample study to see what the tool can do — full
            data already filled in across all eight steps.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn b-lime" onClick={onCreate}>+ Create New Study</button>
            <button
              className="btn b-out"
              onClick={() => onLoadSample(makeSampleStudy())}
              title="Loads a fully-populated example study you can explore and modify"
            >
              ✨ Load Sample Study
            </button>
          </div>
        </div>
      ) : view === 'map' ? (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--teal)', fontWeight: 500 }}>Choctaw Nation Water Systems</div>
                <div style={{ fontSize: 11.5, color: 'var(--mid)', marginTop: 2 }}>
                  Showing {mappedCount} of {studies.length} studies on map. Studies without coordinates won't appear — add an address in Step 1 and click "Geocode".
                </div>
              </div>
              <button className="btn b-lime btn-sm" onClick={onCreate}>+ New Study</button>
            </div>
          </div>
          <MapView studies={studies} onSelect={onSelect} onCreateFromKnown={onCreateFromKnown} />
        </>
      ) : (
        <>
          <div className="g4" style={{ marginBottom: 20 }}>
            {[
              { val: studies.length, l: 'Total Studies' },
              { val: studies.filter(s => s.status === 'complete').length, l: 'Completed' },
              { val: studies.filter(s => s.status === 'in-progress').length, l: 'In Progress' },
              { val: new Set(studies.map(s => s.systemInfo?.county).filter(Boolean)).size, l: 'Counties Served' }
            ].map(({ val, l }) => (
              <div key={l} className="mc"><div className="mv">{val}</div><div className="ml">{l}</div></div>
            ))}
          </div>
          <div className="dbt">
            <table className="dt">
              <thead>
                <tr><th>Study Name</th><th>System</th><th>PWS ID</th><th>County</th><th>Year</th><th>Status</th><th>Updated</th><th></th></tr>
              </thead>
              <tbody>
                {studies.map(s => (
                  <tr key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--teal)' }}>{s.name}</td>
                    <td>{s.systemInfo?.systemName || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.systemInfo?.pwsId || '—'}</td>
                    <td>{s.systemInfo?.county || '—'}</td>
                    <td>{s.systemInfo?.studyYear || '—'}</td>
                    <td><span className={'bs ' + statusMeta(s.status).badgeClass}>{statusMeta(s.status).label}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--dim)' }}>{fmt.date(s.updatedAt)}</td>
                    <td><button className="btn b-teal btn-xs" onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
