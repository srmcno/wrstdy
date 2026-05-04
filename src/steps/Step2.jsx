import { useState } from 'react';
import { defaultClasses } from '../lib/state.js';
import { nv, classMonthlyIncome, totalRevenue, fmt } from '../lib/calc.js';
import { F, $I } from '../components/atoms.jsx';
import { TierTable } from '../components/TierTable.jsx';

export function Step2({ study, onField }) {
  const classes = study.classes || defaultClasses();
  const mhi = study.demographics?.medianMonthlyHHI;
  const [selId, setSelId] = useState(classes[0]?.id);
  const [tab, setTab] = useState('cur');
  const sel = classes.find(c => c.id === selId) || classes[0];
  const updClass = (id, path, val) => {
    const nc = classes.map(c => {
      if (c.id !== id) return c;
      const nc2 = { ...c };
      if (path.length === 1) nc2[path[0]] = val;
      else if (path.length === 2) nc2[path[0]] = { ...nc2[path[0]], [path[1]]: val };
      return nc2;
    });
    onField('classes', nc);
  };
  const toggleClass = (id) => {
    const nc = classes.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c);
    onField('classes', nc);
  };
  const d = tab === 'cur' ? sel.cur : sel.prop;
  const totCur = totalRevenue(classes, false);
  const totProp = totalRevenue(classes, true);
  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Customer Classes & Rates</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Enter rates in $/1,000 gallons per block. Cumulative bill amounts auto-calculate at each tier level.</p>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ width: 190, flexShrink: 0 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="sh" style={{ marginBottom: 10 }}>Customer Classes</div>
            {classes.map(c => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                  background: c.id === selId ? 'var(--lime-pale)' : '',
                  cursor: 'pointer',
                  border: `1px solid ${c.id === selId ? '#86efac' : 'transparent'}`
                }}>
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={() => toggleClass(c.id)}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    style={{ flex: 1, fontSize: 12, color: c.enabled ? 'var(--text)' : 'var(--dim)', cursor: 'pointer' }}
                    onClick={() => setSelId(c.id)}
                  >
                    {c.id.startsWith('c') ? (
                      <input
                        className="inp"
                        value={c.name}
                        onChange={(e) => {
                          const nc = classes.map(x => x.id === c.id ? { ...x, name: e.target.value } : x);
                          onField('classes', nc);
                        }}
                        placeholder={`Class ${c.id.replace('c', '')}`}
                        style={{ fontSize: 11, padding: '2px 6px', border: 'none', background: 'transparent', width: '100%', color: 'inherit' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : <span>{c.name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>System Totals</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 4 }}>Monthly — Current: <strong style={{ color: 'var(--teal)' }}>{fmt.c(totCur.monthly)}</strong></div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 4 }}>Monthly — Proposed: <strong style={{ color: 'var(--lime-dim)' }}>{fmt.c(totProp.monthly)}</strong></div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>Annual — Proposed: <strong style={{ color: 'var(--teal)' }}>{fmt.c(totProp.annual)}</strong></div>
          </div>
        </div>
        {sel && (
          <div style={{ flex: 1 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: 'var(--teal)' }}>{sel.name || (sel.id.startsWith('c') ? `Class ${sel.id.replace('c', '')}` : 'Custom Class')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={'sub-tab' + (tab === 'cur' ? ' on' : '')} onClick={() => setTab('cur')}>Current Rates</button>
                  <button className={'sub-tab' + (tab === 'prop' ? ' on' : '')} onClick={() => setTab('prop')}>Proposed Rates</button>
                </div>
              </div>
              <div className="g3" style={{ marginBottom: 14 }}>
                <F label="Number of Customers">
                  <input
                    className="inp"
                    type="number"
                    value={d.customers}
                    onChange={(e) => updClass(sel.id, [tab === 'cur' ? 'cur' : 'prop', 'customers'], e.target.value)}
                  />
                </F>
                <F label="Total Monthly Gallons Sold" hint="Across all customers in this class">
                  <input
                    className="inp"
                    type="number"
                    value={d.gallonsSold || ''}
                    onChange={(e) => updClass(sel.id, [tab === 'cur' ? 'cur' : 'prop', 'gallonsSold'], e.target.value)}
                    placeholder="0"
                  />
                </F>
                <F label="Base / Minimum Charge ($)" hint="Monthly minimum regardless of usage">
                  <$I
                    value={d.minCharge}
                    onChange={(v) => updClass(sel.id, [tab === 'cur' ? 'cur' : 'prop', 'minCharge'], v)}
                  />
                </F>
              </div>
              <div className="sh">Volume Tier Rates ($/1,000 Gallons)</div>
              <TierTable
                minCharge={d.minCharge}
                tiers={d.tiers}
                onChange={(t) => updClass(sel.id, [tab === 'cur' ? 'cur' : 'prop', 'tiers'], t)}
                mhi={tab === 'prop' ? mhi : null}
                onSetBase={(v) => updClass(sel.id, [tab === 'cur' ? 'cur' : 'prop', 'minCharge'], v)}
              />
              {nv(d.customers) > 0 && nv(d.gallonsSold) > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Monthly Income</div>
                      <div style={{ fontSize: 18, color: 'var(--teal)' }}>{fmt.c(classMonthlyIncome(sel, tab === 'prop').monthly)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Annual Income</div>
                      <div style={{ fontSize: 18, color: 'var(--teal)' }}>{fmt.c(classMonthlyIncome(sel, tab === 'prop').annual)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg Usage/Customer</div>
                      <div style={{ fontSize: 18, color: 'var(--teal)' }}>{fmt.n(Math.round(nv(d.gallonsSold) / nv(d.customers)))} gal</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg Monthly Bill</div>
                      <div style={{ fontSize: 18, color: 'var(--teal)' }}>{fmt.c(classMonthlyIncome(sel, tab === 'prop').monthly / nv(d.customers))}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="card" style={{ marginTop: 14 }}>
              <div className="sh">All Customer Classes — Revenue Summary</div>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Customers</th>
                    <th style={{ textAlign: 'right' }}>Current Mo.</th>
                    <th style={{ textAlign: 'right' }}>Proposed Mo.</th>
                    <th style={{ textAlign: 'right' }}>$ Change</th>
                    <th style={{ textAlign: 'right' }}>% Change</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.filter(c => c.enabled).map(c => {
                    const ci = classMonthlyIncome(c, false);
                    const pi = classMonthlyIncome(c, true);
                    const chg = pi.monthly - ci.monthly;
                    const pct = ci.monthly > 0 ? chg / ci.monthly : 0;
                    return (
                      <tr key={c.id}>
                        <td>{c.name || c.id}</td>
                        <td>{fmt.n(c.cur.customers || c.prop.customers)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt.c(ci.monthly)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt.c(pi.monthly)}</td>
                        <td style={{ textAlign: 'right', color: chg >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
                          {chg >= 0 ? '+' : ''}{fmt.c(chg)}
                        </td>
                        <td style={{ textAlign: 'right' }}>{(pct * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="tr-t">
                    <td>Total</td><td></td>
                    <td style={{ textAlign: 'right' }}>{fmt.c(totCur.monthly)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt.c(totProp.monthly)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {totProp.monthly >= totCur.monthly ? '+' : ''}{fmt.c(totProp.monthly - totCur.monthly)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {totCur.monthly > 0 ? ((totProp.monthly - totCur.monthly) / totCur.monthly * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
