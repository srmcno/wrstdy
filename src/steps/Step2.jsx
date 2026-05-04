import { useState } from 'react';
import { defaultClasses, defaultTiers, defBudget } from '../lib/state.js';
import { nv, classMonthlyIncome, totalRevenue, fmt, calcBill, calcHML, budgetTotal } from '../lib/calc.js';
import { F, $I } from '../components/atoms.jsx';
import { TierTable } from '../components/TierTable.jsx';
import { ask, hasApiKey, MODEL_HEAVY } from '../lib/ai.js';

// True for the user-defined slots c5/c6/c7 only (NOT 'com' for Commercial).
const isCustomSlot = (id) => /^c\d/.test(id);
const cloneSide = (s) => ({
  customers: s.customers || '',
  gallonsSold: s.gallonsSold || '',
  minCharge: s.minCharge || '',
  tiers: (s.tiers || defaultTiers()).map(t => ({ ...t })),
});

export function Step2({ study, onField }) {
  const classes = study.classes || defaultClasses();
  const mhi = study.demographics?.medianMonthlyHHI;
  const [selId, setSelId] = useState(classes[0]?.id);
  const [tab, setTab] = useState('cur'); // 'cur' | 'prop' | 'cmp'
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null); // { explanation, tiers, minCharge }
  const [aiErr, setAiErr] = useState('');
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
    onField('classes', classes.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const copyCurrentToProposed = (id) => {
    if (!window.confirm('Overwrite the proposed rates for this class with the current rates?')) return;
    onField('classes', classes.map(c => c.id === id ? { ...c, prop: cloneSide(c.cur) } : c));
  };
  const copyAllCurrentToProposed = () => {
    if (!window.confirm('Overwrite proposed rates for ALL enabled classes with the current rates? You can then edit the deltas.')) return;
    onField('classes', classes.map(c => c.enabled ? { ...c, prop: cloneSide(c.cur) } : c));
  };

  // CSV bulk import: name,customers,gallons,minCharge[,rate1,rate2...]
  // Mapped to first N enabled classes (or matched by name).
  const applyImport = () => {
    const rows = importText.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    if (rows.length === 0) { setShowImport(false); return; }
    const parsed = rows.map(r => r.split(/[,\t]/).map(s => s.trim()));
    let nc = classes.map(c => ({ ...c }));
    parsed.forEach((row) => {
      if (row.length < 2) return;
      const [name, customers, gallons, minCharge, ...rates] = row;
      // Try to match by name (case-insensitive prefix); else first empty/disabled class
      let target = nc.find(c => (c.name || '').toLowerCase().startsWith(name.toLowerCase()) && name.length > 0);
      if (!target) target = nc.find(c => !c.enabled);
      if (!target) return;
      target.enabled = true;
      target.name = target.name || name;
      const side = {
        customers: customers || '',
        gallonsSold: gallons || '',
        minCharge: minCharge || '',
        tiers: rates.length > 0
          ? rates.map((r, i) => ({ gal: 1000 * (i + 1), rate: r || '' }))
          : (target.cur.tiers && target.cur.tiers.length ? target.cur.tiers.map(t => ({ ...t })) : defaultTiers()),
      };
      target.cur = side;
      target.prop = cloneSide(side);
    });
    onField('classes', nc);
    setImportText('');
    setShowImport(false);
  };

  const d = tab === 'prop' ? sel.prop : sel.cur;
  const totCur = totalRevenue(classes, false);
  const totProp = totalRevenue(classes, true);

  // ─── AI suggest proposed rates ────────────────────────────────────────────
  async function suggestRates() {
    setAiErr(''); setAiSuggestion(null); setAiBusy(true);
    try {
      const propBT = budgetTotal(study.propBudget || defBudget());
      const targetAnnualRevenue = propBT.total * 12 * 1.05; // expense + 5% margin (OR ~1.05+)
      const data = {
        className: sel.name || sel.id,
        currentCustomers: nv(sel.cur.customers),
        currentGallonsSold: nv(sel.cur.gallonsSold),
        currentMinCharge: nv(sel.cur.minCharge),
        currentTiers: (sel.cur.tiers || []).map(t => ({ gal: nv(t.gal), rate: nv(t.rate) })),
        proposedCustomers: nv(sel.prop.customers) || nv(sel.cur.customers),
        proposedGallonsSold: nv(sel.prop.gallonsSold) || nv(sel.cur.gallonsSold),
        monthlyMHI: nv(mhi),
        targetAnnualRevenue: Math.round(targetAnnualRevenue),
        proposedMonthlyExpenses: propBT.total,
      };
      const system = `You are a water-rate consultant for the Choctaw Nation OWRM. Given a class's current rates, customer count, usage, MHI, and the system's proposed monthly expenses, propose a tiered rate structure that:
1. Generates close to the target revenue.
2. Keeps the bill at 5,000 gallons under 2.0% of monthly MHI (USDA/EPA affordability) and ideally under 1.5% (USDA RD grant eligibility).
3. Uses a moderately progressive 4-6 tier structure (1k, 2k, 3k, ... gal blocks) that encourages conservation without punishing essential use.
4. Sets a base/minimum charge that recovers fixed costs but is not excessive.
Return STRICT JSON only — no markdown, no commentary outside JSON. Schema:
{
  "minCharge": number,
  "tiers": [{"gal": number, "rate": number}, ...],
  "explanation": "1-3 short sentences in plain English explaining the trade-offs of this proposal"
}`;
      const user = `CLASS: ${data.className}
Customers: ${data.proposedCustomers}
Total monthly gallons sold: ${data.proposedGallonsSold}
Monthly MHI (per household): $${data.monthlyMHI || 'unknown — assume $4,000'}
System's proposed monthly expenses: $${data.proposedMonthlyExpenses}
Target annual revenue (across ALL classes): $${data.targetAnnualRevenue}
This class's share of total customers should drive its share of the revenue target.

Current rates for context:
- Min charge: $${data.currentMinCharge}
- Tiers: ${JSON.stringify(data.currentTiers)}

Propose new rates for this class only.`;
      const text = await ask({ system, user, model: MODEL_HEAVY, maxTokens: 800 });
      // Try to extract JSON even if the model wrapped it in code fences
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response did not contain JSON: ' + text.slice(0, 200));
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.tiers)) throw new Error('AI response missing tiers array');
      setAiSuggestion(parsed);
    } catch (e) {
      setAiErr(e.message || String(e));
    } finally {
      setAiBusy(false);
    }
  }
  function applyAiSuggestion() {
    if (!aiSuggestion) return;
    const tiers = aiSuggestion.tiers.map(t => ({ gal: nv(t.gal), rate: String(nv(t.rate)) }));
    const newProp = { ...sel.prop, minCharge: String(nv(aiSuggestion.minCharge)), tiers };
    onField('classes', classes.map(c => c.id === sel.id ? { ...c, prop: newProp } : c));
    setAiSuggestion(null);
    setTab('prop');
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Customer Classes & Rates</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>Enter rates in $/1,000 gallons per block. Cumulative bill amounts auto-calculate at each tier level.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn b-out btn-sm" onClick={() => setShowImport(s => !s)} title="Bulk-paste classes from a spreadsheet">📋 Bulk Import</button>
          <button className="btn b-out btn-sm" onClick={copyAllCurrentToProposed} title="Copy current rates to proposed for all enabled classes">⇉ Copy All Cur→Prop</button>
          <button
            className="btn b-lime btn-sm"
            onClick={suggestRates}
            disabled={aiBusy || !hasApiKey()}
            title={hasApiKey() ? `Use AI to suggest a tier structure for ${sel?.name || 'this class'}` : 'Add an Anthropic API key in Step 7 → Settings to enable'}
          >
            {aiBusy ? '✨ Thinking…' : '✨ AI Suggest Rates'}
          </button>
        </div>
      </div>

      {aiErr && <div className="al al-e">{aiErr}</div>}
      {aiSuggestion && (
        <div className="card" style={{ borderLeft: '4px solid var(--lime)', background: 'var(--lime-pale)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--lime-dim)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>✨ AI Proposed Rate Suggestion for {sel.name || sel.id}</div>
              <p style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 6, lineHeight: 1.6 }}>{aiSuggestion.explanation}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn b-out btn-sm" onClick={() => setAiSuggestion(null)}>Discard</button>
              <button className="btn b-lime btn-sm" onClick={applyAiSuggestion}>Apply to Proposed →</button>
            </div>
          </div>
          <table className="dt" style={{ background: '#fff' }}>
            <thead><tr><th>Block (gal)</th><th style={{ textAlign: 'right' }}>Rate ($/1k)</th></tr></thead>
            <tbody>
              <tr><td>Base / Minimum Charge</td><td style={{ textAlign: 'right' }}>{fmt.c(aiSuggestion.minCharge)}</td></tr>
              {aiSuggestion.tiers.map((t, i) => (
                <tr key={i}><td>{fmt.n(t.gal)}</td><td style={{ textAlign: 'right' }}>{fmt.r(t.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <div className="card" style={{ background: 'var(--surface)' }}>
          <div className="sh">Bulk Import Classes (CSV / TSV)</div>
          <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
            One row per class. Columns (comma or tab separated):{' '}
            <code style={{ background: '#fff', padding: '1px 5px', borderRadius: 3 }}>name, customers, gallonsSold, minCharge, tier1Rate, tier2Rate, ...</code>
            {' '}Matches existing classes by name prefix; otherwise fills the first disabled slot. Both Current and Proposed are populated; edit Proposed afterward.
          </p>
          <textarea
            className="txa"
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Residential, 240, 1800000, 18.00, 4.50, 5.00, 5.50, 6.00, 6.50, 7.00\nCommercial, 18, 540000, 25.00, 5.00, 5.50, 6.00, 6.50, 7.00, 7.50"}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button className="btn b-out btn-sm" onClick={() => { setShowImport(false); setImportText(''); }}>Cancel</button>
            <button className="btn b-lime btn-sm" onClick={applyImport}>Apply Import</button>
          </div>
        </div>
      )}

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
                    {isCustomSlot(c.id) ? (
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
                <div style={{ fontSize: 14, color: 'var(--teal)' }}>{sel.name || (isCustomSlot(sel.id) ? `Class ${sel.id.replace('c', '')}` : 'Custom Class')}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {tab !== 'cmp' && (
                    <button
                      className="btn b-out btn-xs"
                      onClick={() => copyCurrentToProposed(sel.id)}
                      title="Copy this class's current rates to proposed"
                    >
                      ⇉ Cur→Prop
                    </button>
                  )}
                  <button className={'sub-tab' + (tab === 'cur' ? ' on' : '')} onClick={() => setTab('cur')}>Current</button>
                  <button className={'sub-tab' + (tab === 'prop' ? ' on' : '')} onClick={() => setTab('prop')}>Proposed</button>
                  <button className={'sub-tab' + (tab === 'cmp' ? ' on' : '')} onClick={() => setTab('cmp')}>Compare</button>
                </div>
              </div>

              {tab === 'cmp' ? (
                <CompareView
                  cls={sel}
                  mhi={mhi}
                  onUpd={(side, path, val) => updClass(sel.id, [side, path], val)}
                  onTier={(side, i, k, val) => {
                    const sideKey = side; // 'cur' or 'prop'
                    const arr = (sel[sideKey].tiers || []).map(t => ({ ...t }));
                    while (arr.length <= i) arr.push({ gal: 1000 * (arr.length + 1), rate: '' });
                    arr[i] = { ...arr[i], [k]: val };
                    updClass(sel.id, [sideKey, 'tiers'], arr);
                  }}
                />
              ) : (
                <>
                  <div className="g3" style={{ marginBottom: 14 }}>
                    <F label="Number of Customers">
                      <input
                        className="inp"
                        type="number"
                        value={d.customers}
                        onChange={(e) => updClass(sel.id, [tab, 'customers'], e.target.value)}
                      />
                    </F>
                    <F label="Total Monthly Gallons Sold" hint="Across all customers in this class">
                      <input
                        className="inp"
                        type="number"
                        value={d.gallonsSold || ''}
                        onChange={(e) => updClass(sel.id, [tab, 'gallonsSold'], e.target.value)}
                        placeholder="0"
                      />
                    </F>
                    <F label="Base / Minimum Charge ($)" hint="Monthly minimum regardless of usage">
                      <$I
                        value={d.minCharge}
                        onChange={(v) => updClass(sel.id, [tab, 'minCharge'], v)}
                      />
                    </F>
                  </div>
                  <div className="sh">Volume Tier Rates ($/1,000 Gallons)</div>
                  <TierTable
                    minCharge={d.minCharge}
                    tiers={d.tiers}
                    onChange={(t) => updClass(sel.id, [tab, 'tiers'], t)}
                    mhi={tab === 'prop' ? mhi : null}
                    onSetBase={(v) => updClass(sel.id, [tab, 'minCharge'], v)}
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
                </>
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

// Compact $-prefixed number input for Compare cells
const CmpInput = ({ value, onChange, money = false, step = '0.01' }) => (
  <div style={{ position: 'relative' }}>
    {money && (
      <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', fontSize: 11, pointerEvents: 'none' }}>$</span>
    )}
    <input
      type="number"
      step={step}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      style={{
        width: '100%',
        padding: money ? '4px 6px 4px 16px' : '4px 6px',
        border: '1px solid var(--border)',
        borderRadius: 4,
        fontFamily: 'var(--font)',
        fontSize: 12,
        textAlign: 'right',
        background: '#fff',
      }}
    />
  </div>
);

function CompareView({ cls, mhi, onUpd, onTier }) {
  const hml = mhi ? calcHML({ prop: { minCharge: cls.prop?.minCharge, tiers: cls.prop?.tiers || [] } }, true, mhi) : null;
  const cur = cls.cur || {};
  const prop = cls.prop || {};
  const tierMax = Math.max((cur.tiers || []).length, (prop.tiers || []).length, 1);
  const tiers = [];
  for (let i = 0; i < tierMax; i++) {
    tiers.push({
      gal: cur.tiers?.[i]?.gal ?? prop.tiers?.[i]?.gal ?? 1000 * (i + 1),
      curRate: cur.tiers?.[i]?.rate,
      propRate: prop.tiers?.[i]?.rate,
    });
  }
  const ci = classMonthlyIncome(cls, false);
  const pi = classMonthlyIncome(cls, true);
  const billRow = (gal) => {
    const c = calcBill(cur.minCharge, cur.tiers || [], gal);
    const p = calcBill(prop.minCharge, prop.tiers || [], gal);
    return { gal, c, p, d: p - c };
  };
  const samples = [2000, 5000, 10000, 20000].map(billRow);

  const fields = [
    { label: 'Number of Customers', curVal: cur.customers, propVal: prop.customers, key: 'customers', money: false, step: '1' },
    { label: 'Monthly Gallons Sold', curVal: cur.gallonsSold, propVal: prop.gallonsSold, key: 'gallonsSold', money: false, step: '100' },
    { label: 'Base / Minimum Charge', curVal: cur.minCharge, propVal: prop.minCharge, key: 'minCharge', money: true, step: '0.01' },
  ];

  const colHeader = (text, color) => (
    <th style={{ textAlign: 'right', color: color || 'inherit' }}>{text}</th>
  );

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
        Edit either column directly. The Δ column updates as you change values; the calculated income row recomputes from your latest inputs.
      </p>
      {hml && (
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div className="flb" style={{ marginBottom: 6 }}>Recommended Proposed Base Charge (% of Monthly MHI)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn b-low btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.low.toFixed(2))}>
              Low — {fmt.c(hml.low)} <span style={{ fontSize: 10 }}>(1.5% USDA RD)</span>
            </button>
            <button className="btn b-med btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.med.toFixed(2))}>
              Medium — {fmt.c(hml.med)} <span style={{ fontSize: 10 }}>(2.0% benchmark)</span>
            </button>
            <button className="btn b-hi btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.high.toFixed(2))}>
              High — {fmt.c(hml.high)} <span style={{ fontSize: 10 }}>(2.5% EPA)</span>
            </button>
          </div>
        </div>
      )}

      <table className="dt" style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th>Field</th>
            {colHeader('Current')}
            {colHeader('Proposed')}
            {colHeader('Δ')}
          </tr>
        </thead>
        <tbody>
          {fields.map(f => {
            const d = nv(f.propVal) - nv(f.curVal);
            const fmtVal = f.money ? fmt.c : fmt.n;
            return (
              <tr key={f.key}>
                <td style={{ verticalAlign: 'middle' }}>{f.label}</td>
                <td style={{ width: 130 }}>
                  <CmpInput value={f.curVal} onChange={(v) => onUpd('cur', f.key, v)} money={f.money} step={f.step} />
                </td>
                <td style={{ width: 130 }}>
                  <CmpInput value={f.propVal} onChange={(v) => onUpd('prop', f.key, v)} money={f.money} step={f.step} />
                </td>
                <td style={{ textAlign: 'right', color: d > 0 ? 'var(--red)' : d < 0 ? 'var(--lime-dim)' : 'var(--mid)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {d === 0 ? '—' : (d > 0 ? '+' : '') + fmtVal(d)}
                </td>
              </tr>
            );
          })}
          <tr className="tr-s">
            <td>Monthly Income (calculated)</td>
            <td style={{ textAlign: 'right' }}>{fmt.c(ci.monthly)}</td>
            <td style={{ textAlign: 'right' }}>{fmt.c(pi.monthly)}</td>
            <td style={{ textAlign: 'right', color: pi.monthly - ci.monthly >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
              {pi.monthly - ci.monthly >= 0 ? '+' : ''}{fmt.c(pi.monthly - ci.monthly)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="sh">Tier-by-Tier Rate Comparison</div>
      <table className="dt" style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th>Block (gal)</th>
            {colHeader('Current ($/1k)')}
            {colHeader('Proposed ($/1k)')}
            {colHeader('Δ')}
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => {
            const d = nv(t.propRate) - nv(t.curRate);
            return (
              <tr key={i}>
                <td style={{ width: 100 }}>
                  <CmpInput value={t.gal} onChange={(v) => onTier('cur', i, 'gal', Number(v))} step="1000" />
                </td>
                <td style={{ width: 130 }}>
                  <CmpInput value={t.curRate} onChange={(v) => onTier('cur', i, 'rate', v)} money step="0.01" />
                </td>
                <td style={{ width: 130 }}>
                  <CmpInput value={t.propRate} onChange={(v) => onTier('prop', i, 'rate', v)} money step="0.01" />
                </td>
                <td style={{ textAlign: 'right', color: d > 0 ? 'var(--red)' : d < 0 ? 'var(--lime-dim)' : 'var(--mid)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {d === 0 ? '—' : (d > 0 ? '+' : '') + fmt.r(d)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="sh">Sample Customer Bills (calculated)</div>
      <table className="dt">
        <thead>
          <tr>
            <th>Usage</th>
            {colHeader('Bill (Current)')}
            {colHeader('Bill (Proposed)')}
            {colHeader('Δ')}
            {colHeader('%')}
          </tr>
        </thead>
        <tbody>
          {samples.map(s => (
            <tr key={s.gal}>
              <td>{fmt.n(s.gal)} gal</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(s.c)}</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(s.p)}</td>
              <td style={{ textAlign: 'right', color: s.d > 0 ? 'var(--red)' : s.d < 0 ? 'var(--lime-dim)' : 'var(--mid)' }}>
                {s.d === 0 ? '—' : (s.d > 0 ? '+' : '') + fmt.c(s.d)}
              </td>
              <td style={{ textAlign: 'right' }}>{s.c > 0 ? ((s.d / s.c) * 100).toFixed(1) + '%' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
