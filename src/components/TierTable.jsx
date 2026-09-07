import { nv, calcBill, tierTopAmounts, calcHML, fmt } from '../lib/calc.js';

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
  const sortedGals = tiers.map(t => nv(t.gal)).filter(g => g > 0);
  const lastGal = sortedGals.length > 0 ? Math.max(...sortedGals) : 0;
  const lastRate = (() => {
    if (!lastGal) return 0;
    const t = tiers.find(x => nv(x.gal) === lastGal);
    return nv(t?.rate);
  })();
  const unsorted = tiers.some((t, i) => i > 0 && nv(t.gal) <= nv(tiers[i - 1].gal));
  return (
    <div>
      {hml && (
        <div style={{ marginBottom: 10 }}>
          <div className="flb" style={{ marginBottom: 6 }}>Illustrative Base Charge (% of Monthly MHI)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn b-low btn-sm" onClick={() => onSetBase(hml.low.toFixed(2))}>
              Low — {fmt.c(hml.low)} <span style={{ fontSize: 10 }}>(1.5% of MHI)</span>
            </button>
            <button className="btn b-med btn-sm" onClick={() => onSetBase(hml.med.toFixed(2))}>
              Medium — {fmt.c(hml.med)} <span style={{ fontSize: 10 }}>(2.0% of MHI)</span>
            </button>
            <button className="btn b-hi btn-sm" onClick={() => onSetBase(hml.high.toFixed(2))}>
              High — {fmt.c(hml.high)} <span style={{ fontSize: 10 }}>(2.5% of MHI)</span>
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 5 }}>
            Illustrative base charges for a 5,000-gallon bill. These income screens do not establish revenue sufficiency, household affordability, or grant eligibility.
          </div>
          {calcBill(minCharge, tiers, 5000) > 0 && calcBill(minCharge, tiers, 5000) <= nv(mhi) * 0.015 && (
            <div className="al al-ok" style={{ marginTop: 8, fontSize: 11 }}>
              The base charge is within the 1.5% income screen. Verify the full bill, revenue needs, and impacts on lower-income households before recommending rates.
            </div>
          )}
        </div>
      )}
      <table className="tt">
        <thead>
          <tr>
            <th>Block up to (gal)</th>
            <th>Block name <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></th>
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
                  min="0"
                  step="500"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                  value={t.gal ?? ''}
                  /* Store the raw string. Number('') is 0, so coercing here
                     turned a cleared breakpoint into a literal "0" in the box
                     that the user then had to delete before typing. */
                  onChange={(e) => updTier(i, 'gal', e.target.value)}
                  placeholder="1000"
                  aria-label={`Block ${i + 1} upper limit in gallons`}
                />
              </td>
              <td>
                <input
                  className="inp"
                  type="text"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  value={t.label || ''}
                  onChange={(e) => updTier(i, 'label', e.target.value)}
                  placeholder={i === 0 ? 'e.g. Lifeline' : ''}
                />
              </td>
              <td>
                <div className="cw">
                  <span className="cs" style={{ fontSize: 11 }}>$</span>
                  <input
                    className="inp ci"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{ fontSize: 12, padding: '4px 8px 4px 18px' }}
                    value={t.rate ?? ''}
                    onChange={(e) => updTier(i, 'rate', e.target.value)}
                    placeholder="0.00"
                    aria-label={`Block ${i + 1} rate per 1,000 gallons`}
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
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => remTier(i)}
                    title="Remove this block"
                    aria-label={`Remove tier block ${i + 1}`}
                  >✕</button>
                )}
              </td>
            </tr>
          ))}
          {lastGal > 0 && (
            <tr>
              <td colSpan={5} style={{ fontSize: 11, color: 'var(--dim)', padding: '6px 8px', background: 'var(--surface)' }}>
                {fmt.n(lastGal)}+ gal — all additional usage continues at the final block rate ({fmt.r(lastRate)}/1,000 gal). High-use customers (20,000–40,000+ gal) are billed in full; revenue is never capped at the last block.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {unsorted && (
        <div className="al al-w" style={{ marginTop: 8, fontSize: 11 }}>
          Blocks are out of order — billing automatically sorts them by gallons, but consider reordering for readability.
        </div>
      )}
      <button className="btn b-out btn-xs" style={{ marginTop: 8 }} onClick={addTier}>+ Add Tier Block</button>
    </div>
  );
}
