import { nv, tierTopAmounts, calcHML, fmt } from '../lib/calc.js';

export function TierTable({ minCharge, tiers, onChange, mhi, onSetBase }) {
  const tops = tierTopAmounts(minCharge, tiers);
  const updTier = (i, k, v) => {
    const t = [...tiers];
    t[i] = { ...t[i], [k]: v };
    onChange(t);
  };
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    onChange([...tiers, { gal: nv(last?.gal) + 1000, rate: '' }]);
  };
  const remTier = (i) => {
    if (tiers.length <= 1) return;
    const t = [...tiers];
    t.splice(i, 1);
    onChange(t);
  };
  const hml = mhi ? calcHML({ prop: { minCharge, tiers } }, true, mhi) : null;
  return (
    <div>
      {hml && (
        <div style={{ marginBottom: 10 }}>
          <div className="flb" style={{ marginBottom: 6 }}>Recommended Base Charge (% of Monthly MHI)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn b-low btn-sm" onClick={() => onSetBase(hml.low.toFixed(2))}>
              Low — {fmt.c(hml.low)} <span style={{ fontSize: 10 }}>(1.5% USDA RD)</span>
            </button>
            <button className="btn b-med btn-sm" onClick={() => onSetBase(hml.med.toFixed(2))}>
              Medium — {fmt.c(hml.med)} <span style={{ fontSize: 10 }}>(2.0% benchmark)</span>
            </button>
            <button className="btn b-hi btn-sm" onClick={() => onSetBase(hml.high.toFixed(2))}>
              High — {fmt.c(hml.high)} <span style={{ fontSize: 10 }}>(2.5% EPA)</span>
            </button>
          </div>
          {nv(minCharge) > 0 && nv(minCharge) <= hml.low + 0.01 && (
            <div className="al al-ok" style={{ marginTop: 8, fontSize: 11 }}>
              Current base rate qualifies for USDA Rural Development loan/grant eligibility.
            </div>
          )}
        </div>
      )}
      <table className="tt">
        <thead>
          <tr>
            <th>Block (gal)</th>
            <th>Rate ($/1,000 gal)</th>
            <th style={{ color: 'var(--lime-dim)' }}>Cumulative Bill (auto)</th>
            <th style={{ width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td>
                <input
                  className="inp"
                  type="number"
                  step="1000"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                  value={t.gal}
                  onChange={(e) => updTier(i, 'gal', Number(e.target.value))}
                  placeholder="1000"
                />
              </td>
              <td>
                <div className="cw">
                  <span className="cs" style={{ fontSize: 11 }}>$</span>
                  <input
                    className="inp ci"
                    type="number"
                    step="0.01"
                    style={{ fontSize: 12, padding: '4px 8px 4px 18px' }}
                    value={t.rate}
                    onChange={(e) => updTier(i, 'rate', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </td>
              <td>
                <div style={{
                  fontSize: 12, color: 'var(--lime-dim)', fontWeight: 500,
                  padding: '4px 8px',
                  background: tops[i] > 0 ? 'var(--lime-pale)' : '',
                  borderRadius: 4
                }}>
                  {tops[i] > 0 ? fmt.c(tops[i]) : '—'}
                </div>
              </td>
              <td>
                {tiers.length > 1 && (
                  <button onClick={() => remTier(i)} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn b-out btn-xs" style={{ marginTop: 8 }} onClick={addTier}>+ Add Tier Block</button>
    </div>
  );
}
