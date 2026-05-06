import { nv, fmt } from '../lib/calc.js';
import { F, $I } from './atoms.jsx';

export function BudgetSection({ title, fields, data = {}, onChange }) {
  const safeData = data || {};
  const total = fields.reduce((s, f) => s + nv(safeData[f.k]), 0);
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 9, borderBottom: '1px solid var(--border)', marginBottom: 13 }}>
        <div className="sh" style={{ paddingBottom: 0, borderBottom: 'none', marginBottom: 0 }}>{title}</div>
        <span style={{ fontSize: 13, color: 'var(--teal)' }}>{fmt.c(total)}</span>
      </div>
      <div className="g3">
        {fields.map(f => (
          <F key={f.k} label={f.l} hint={f.h || undefined}>
            <$I value={safeData[f.k]} onChange={(v) => onChange(f.k, v)} />
          </F>
        ))}
      </div>
    </div>
  );
}
