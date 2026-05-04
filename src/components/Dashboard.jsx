import { fmt } from '../lib/calc.js';

export function Dashboard({ studies, onSelect, onCreate }) {
  return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, color: 'var(--teal)', marginBottom: 5 }}>Water Rate Studies</h1>
        <p style={{ color: 'var(--mid)', lineHeight: 1.65, maxWidth: 560, fontSize: 12.5 }}>
          Conduct and manage rate studies for tribal public water systems. Walks through customer
          classes, budget, financial metrics, 5-year projection, and generates a board-ready report.
        </p>
      </div>
      {studies.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 28px', maxWidth: 460, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: .35 }}>💧</div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 7 }}>No Rate Studies</h2>
          <p style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 20 }}>Create your first study to begin.</p>
          <button className="btn b-lime" onClick={onCreate}>+ Create New Study</button>
        </div>
      ) : (
        <>
          <div className="g4" style={{ marginBottom: 20 }}>
            {[
              { val: studies.length, l: 'Total Studies' },
              { val: studies.filter(s => s.status === 'complete').length, l: 'Completed' },
              { val: studies.filter(s => s.status === 'in-progress').length, l: 'In Progress' },
              { val: new Set(studies.map(s => s.systemInfo?.county).filter(Boolean)).size, l: 'Counties' }
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
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{s.systemInfo?.pwsId || '—'}</td>
                    <td>{s.systemInfo?.county || '—'}</td>
                    <td>{s.systemInfo?.studyYear || '—'}</td>
                    <td><span className={'bs ' + (s.status === 'complete' ? 'bsc' : s.status === 'in-progress' ? 'bsp' : 'bsd')}>{s.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--dim)' }}>{fmt.date(s.updatedAt)}</td>
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
