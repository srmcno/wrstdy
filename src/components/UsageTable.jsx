import { nv, fmt, calcBill, usageBrackets } from '../lib/calc.js';

// Customer usage distribution editor. Rows say "N customers use about G
// gallons/month". When at least one row has a customer count, revenue for the
// class is computed bracket-by-bracket against the tier structure instead of
// billing everyone at the class average — which is what makes rate changes in
// high-usage blocks show up in projected revenue.
export function UsageTable({ usage, onChange, curSide, propSide }) {
  const rows = Array.isArray(usage) && usage.length > 0 ? usage : [];
  const upd = (i, k, v) => {
    const u = rows.map(r => ({ ...r }));
    u[i] = { ...u[i], [k]: v };
    onChange(u);
  };
  const addRow = (preset) => onChange([...rows, { customers: '', gallons: preset || '', note: '' }]);
  const remRow = (i) => {
    const u = rows.map(r => ({ ...r }));
    u.splice(i, 1);
    onChange(u);
  };
  const valid = usageBrackets({ usage: rows });
  const totCust = valid.reduce((s, b) => s + nv(b.customers), 0);
  const totGal = valid.reduce((s, b) => s + nv(b.customers) * nv(b.gallons), 0);
  const active = valid.length > 0;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="sh" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Customer Usage Distribution
        <span style={{
          fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600, letterSpacing: '.05em',
          background: active ? 'var(--lime-pale)' : 'var(--surface)',
          color: active ? 'var(--lime-dim)' : 'var(--dim)',
          border: `1px solid ${active ? '#86efac' : 'var(--border)'}`,
        }}>
          {active ? 'ACTIVE — drives revenue' : 'OPTIONAL — recommended'}
        </span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--mid)', margin: '4px 0 8px' }}>
        Enter how many customers fall at each monthly usage level (from billing reports). With a distribution,
        revenue is billed bracket-by-bracket through the tier blocks — so raising a high block's rate correctly
        raises projected revenue even when average usage is low. Without one, the tool falls back to billing
        every customer at the class average, which <strong>understates</strong> revenue for tiered rates.
        The same distribution is used for Current and Proposed (only the rates differ).
      </p>
      {rows.length > 0 && (
        <table className="tt">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Customers</th>
              <th style={{ width: 140 }}>Monthly gallons (each)</th>
              <th style={{ width: 110 }}>Bill — Current</th>
              <th style={{ width: 110 }}>Bill — Proposed</th>
              <th>Notes / source <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const g = nv(r.gallons);
              const cb = calcBill(curSide?.minCharge, curSide?.tiers || [], g);
              const pb = calcBill(propSide?.minCharge, propSide?.tiers || [], g);
              const on = nv(r.customers) > 0;
              return (
                <tr key={i}>
                  <td>
                    <input className="inp" type="number" min="0" step="1" style={{ fontSize: 12, padding: '4px 8px' }}
                      value={r.customers} onChange={(e) => upd(i, 'customers', e.target.value)} placeholder="0" />
                  </td>
                  <td>
                    <input className="inp" type="number" min="0" step="500" style={{ fontSize: 12, padding: '4px 8px' }}
                      value={r.gallons} onChange={(e) => upd(i, 'gallons', e.target.value)} placeholder="e.g. 2000" />
                  </td>
                  <td style={{ fontSize: 12, color: on ? 'var(--mid)' : 'var(--dim)', fontFamily: 'monospace' }}>{fmt.c(cb)}</td>
                  <td style={{ fontSize: 12, color: on ? 'var(--lime-dim)' : 'var(--dim)', fontFamily: 'monospace' }}>{fmt.c(pb)}</td>
                  <td>
                    <input className="inp" type="text" style={{ fontSize: 11, padding: '4px 8px' }}
                      value={r.note || ''} onChange={(e) => upd(i, 'note', e.target.value)} placeholder="e.g. May billing register" />
                  </td>
                  <td>
                    <button onClick={() => remRow(i)} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }} title="Remove row">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {active && (
            <tfoot>
              <tr className="tr-t">
                <td style={{ fontSize: 12 }}>{fmt.n(totCust)}</td>
                <td colSpan={4} style={{ fontSize: 11, color: 'var(--mid)' }}>
                  Derived totals: <strong>{fmt.n(totCust)}</strong> customers · <strong>{fmt.n(totGal)}</strong> gal/month
                  ({totCust > 0 ? fmt.n(Math.round(totGal / totCust)) : 0} gal avg). These replace the manual
                  customer/gallon fields above for all calculations.
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn b-out btn-xs" onClick={() => addRow('')}>+ Add usage row</button>
        {rows.length === 0 && (
          <button
            className="btn b-out btn-xs"
            title="Start with common usage levels: 1,000 / 2,000 / 5,000 / 10,000 / 20,000 gal"
            onClick={() => onChange([
              { customers: '', gallons: '1000', note: '' },
              { customers: '', gallons: '2000', note: '' },
              { customers: '', gallons: '5000', note: '' },
              { customers: '', gallons: '10000', note: '' },
              { customers: '', gallons: '20000', note: '' },
            ])}
          >
            + Start from template (1k / 2k / 5k / 10k / 20k)
          </button>
        )}
        {rows.length > 0 && !active && (
          <span style={{ fontSize: 10.5, color: 'var(--dim)', alignSelf: 'center' }}>
            Enter a customer count on at least one row to activate distribution-based revenue.
          </span>
        )}
      </div>
    </div>
  );
}
