import { useState, useRef, useEffect } from 'react';
import { defaultClasses, defaultTiers, defBudget } from '../lib/state.js';
import {
  nv, classMonthlyIncome, totalRevenue, fmt, calcBill, calcHML, budgetTotal,
  hasUsageDistribution, classCustomers, classGallons, usageBrackets,
  normalizeTiers, rateStructureComparison,
} from '../lib/calc.js';
import { F, $I } from '../components/atoms.jsx';
import { TierTable } from '../components/TierTable.jsx';
import { UsageTable } from '../components/UsageTable.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { ask, hasApiKey, MODEL_HEAVY } from '../lib/ai.js';
import { pushToast } from '../components/Toasts.jsx';

// True for the user-defined slots c5/c6/c7 only (NOT 'com' for Commercial).
const isCustomSlot = (id) => /^c\d/.test(id);
const classPlaceholder = (c) => isCustomSlot(c.id) ? `Custom class ${c.id.replace('c', '')}` : c.id;

// Quote a CSV field if it contains a comma, quote, or newline.
const csvQuote = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportClassesCsv(classes, study) {
  const enabled = (classes || []).filter(c => c.enabled);
  if (enabled.length === 0) {
    pushToast('No enabled customer classes to export.', { kind: 'warn' });
    return;
  }
  // Header: id, name, side, customers, gallonsSold, minCharge, tier1Gal, tier1Rate, ...
  const maxTiers = Math.max(0, ...enabled.flatMap(c => [c.cur?.tiers?.length || 0, c.prop?.tiers?.length || 0]));
  const tierCols = [];
  for (let i = 1; i <= maxTiers; i++) tierCols.push(`tier${i}Gal`, `tier${i}Rate`);
  const head = ['id', 'name', 'side', 'customers', 'gallonsSold', 'minCharge', ...tierCols];
  const rows = [head];
  for (const c of enabled) {
    for (const side of ['cur', 'prop']) {
      const s = c[side] || {};
      const tiers = s.tiers || [];
      const flat = [];
      for (let i = 0; i < maxTiers; i++) {
        flat.push(tiers[i]?.gal ?? '', tiers[i]?.rate ?? '');
      }
      rows.push([c.id, c.name || '', side, s.customers ?? '', s.gallonsSold ?? '', s.minCharge ?? '', ...flat]);
    }
  }
  const csv = rows.map(r => r.map(csvQuote).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safe = (study.systemInfo?.systemName || study.name || 'rate-study').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const filename = `${safe}-tier-rates.csv`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  pushToast(`Exported ${filename}`);
}
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
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
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

  // null | { kind: 'one', id } | { kind: 'all' } — pending Cur→Prop copy
  // awaiting confirmation in the styled modal (matches the rest of the app;
  // native window.confirm looked out of place and can be suppressed by the
  // browser).
  const [confirmCopy, setConfirmCopy] = useState(null);
  const doCopyCurrentToProposed = (id) => {
    onField('classes', classes.map(c => c.id === id ? { ...c, prop: cloneSide(c.cur) } : c));
  };
  const doCopyAllCurrentToProposed = () => {
    onField('classes', classes.map(c => c.enabled ? { ...c, prop: cloneSide(c.cur) } : c));
  };

  // CSV bulk import: name,customers,gallons,minCharge[,rate1,rate2...]
  // Mapped to first N enabled classes (or matched by name).
  // Each rate cell can be a plain number (legacy behavior — mapped to the
  // 1,000/2,000/3,000... breakpoint at its position) or a "gal:rate" pair
  // (e.g. "500:4.00") for systems whose blocks don't land on round
  // 1,000-gallon multiples — sub-1,000 lifeline blocks, 2,500/7,500 splits, etc.
  const parseTierCell = (cell, i) => {
    const s = String(cell ?? '').trim();
    const colonIdx = s.indexOf(':');
    if (colonIdx > -1) {
      return { gal: nv(s.slice(0, colonIdx)), rate: s.slice(colonIdx + 1).trim() };
    }
    return { gal: 1000 * (i + 1), rate: s };
  };
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
          ? rates.map(parseTierCell).filter(t => t.gal > 0).sort((a, b) => a.gal - b.gal)
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
  const distActive = hasUsageDistribution(sel);
  const effCust = classCustomers(sel, tab === 'prop');
  const effGal = classGallons(sel, tab === 'prop');
  const totCur = totalRevenue(classes, false);
  const totProp = totalRevenue(classes, true);

  // ─── AI suggest proposed rates ────────────────────────────────────────────
  async function suggestRates() {
    setAiErr(''); setAiSuggestion(null); setAiBusy(true);
    try {
      const propBT = budgetTotal(study.propBudget || defBudget());
      const targetAnnualRevenue = propBT.total * 12 * 1.05; // expense + 5% margin (OR ~1.05+)
      const brackets = usageBrackets(sel);
      const data = {
        className: sel.name || sel.id,
        currentCustomers: classCustomers(sel, false),
        currentGallonsSold: classGallons(sel, false),
        currentMinCharge: nv(sel.cur.minCharge),
        currentTiers: (sel.cur.tiers || []).map(t => ({ gal: nv(t.gal), rate: nv(t.rate) })),
        proposedCustomers: classCustomers(sel, true) || classCustomers(sel, false),
        proposedGallonsSold: classGallons(sel, true) || classGallons(sel, false),
        monthlyMHI: nv(mhi),
        targetAnnualRevenue: Math.round(targetAnnualRevenue),
        proposedMonthlyExpenses: propBT.total,
      };
      const system = `You are a water-rate consultant for the Choctaw Nation OWRM. Given a class's current rates, customer count, usage, MHI, and the system's proposed monthly expenses, propose a tiered rate structure that:
1. Generates close to the target revenue. When a customer usage distribution is provided, compute revenue bracket-by-bracket (customers × bill at their usage) — do NOT assume everyone uses the class average.
2. Keeps the bill at 5,000 gallons under 2.0% of monthly MHI (EPA affordability benchmark). Note that USDA RD grant assistance generally targets systems whose cost burden EXCEEDS 1.5% of MHI — affordability and grant positioning trade off; do not treat "under 1.5%" as grant-eligible.
3. Uses a moderately progressive tier structure that encourages conservation without punishing essential use. Usage past the final block continues at the final block's rate, so a meaningful top-block rate shifts burden to high-volume users.
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
${brackets.length > 0
  ? `Customer usage distribution (customers @ monthly gallons): ${brackets.map(b => `${nv(b.customers)} @ ${nv(b.gallons)}`).join(', ')}`
  : 'No usage distribution entered — only the class average is known (treat revenue as approximate).'}
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
      const jsonMatch = (typeof text === 'string' ? text : '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response did not contain JSON: ' + (text || '').slice(0, 200));
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.tiers)) throw new Error('AI response missing tiers array');
      if (mountedRef.current) setAiSuggestion(parsed);
    } catch (e) {
      console.error('AI suggest rates failed', e);
      if (mountedRef.current) setAiErr(e.message || String(e));
    } finally {
      if (mountedRef.current) setAiBusy(false);
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
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>Tier rates are entered in dollars per 1,000 gallons within that block. Each block applies only to gallons used in that range — cumulative bill amounts auto-calculate as usage increases.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn b-out btn-sm" onClick={() => setShowImport(s => !s)} title="Bulk-paste classes from a spreadsheet">📋 Bulk Import</button>
          <button className="btn b-out btn-sm" onClick={() => exportClassesCsv(classes, study)} title="Download a CSV of all enabled customer classes and tier rates">↓ Export CSV</button>
          <button className="btn b-out btn-sm" onClick={() => setConfirmCopy({ kind: 'all' })} title="Copy current rates to proposed for all enabled classes">⇉ Copy All Cur→Prop</button>
          <button
            className="btn b-lime btn-sm"
            onClick={suggestRates}
            disabled={aiBusy || !hasApiKey()}
            aria-label="Use AI to suggest a tier rate structure for the selected customer class"
            title={hasApiKey() ? `Use AI to suggest a tier structure for ${sel?.name || 'this class'}` : 'Add an API key in Step 7 → Settings to enable'}
          >
            {aiBusy
              ? <><span className="spin" /> Thinking…</>
              : '✨ AI Suggest Rates'}
          </button>
        </div>
      </div>

      {confirmCopy && (
        <ConfirmModal
          title={confirmCopy.kind === 'all' ? 'Copy current rates to proposed for ALL classes?' : 'Copy current rates to proposed?'}
          message={confirmCopy.kind === 'all'
            ? 'The proposed rates, customers, and gallons for every enabled class will be overwritten with the current values. You can then edit the deltas.'
            : `"${sel?.name || 'This class'}" — the proposed rates, customers, and gallons will be overwritten with the current values.`}
          confirmLabel="Copy Cur→Prop"
          destructive={false}
          onConfirm={() => {
            if (confirmCopy.kind === 'all') doCopyAllCurrentToProposed();
            else doCopyCurrentToProposed(confirmCopy.id);
            setConfirmCopy(null);
          }}
          onCancel={() => setConfirmCopy(null)}
        />
      )}
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
          <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
            Each rate column defaults to a 1,000-gallon breakpoint at its position (1st column = up to 1,000 gal,
            2nd = up to 2,000 gal, ...). For custom breakpoints — sub-1,000-gallon blocks, or blocks that don't land
            on round 1,000s — write <code style={{ background: '#fff', padding: '1px 5px', borderRadius: 3 }}>gallons:rate</code>{' '}
            instead, e.g. <code style={{ background: '#fff', padding: '1px 5px', borderRadius: 3 }}>500:4.00</code>.
          </p>
          <textarea
            className="txa"
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Residential, 240, 1800000, 18.00, 500:4.00, 1500:4.75, 5.50, 6.00, 6.50, 7.00\nCommercial, 18, 540000, 25.00, 5.00, 5.50, 6.00, 6.50, 7.00, 7.50"}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button className="btn b-out btn-sm" onClick={() => { setShowImport(false); setImportText(''); }}>Cancel</button>
            <button className="btn b-lime btn-sm" onClick={applyImport}>Apply Import</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
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
                    <input
                      className="inp"
                      value={c.name}
                      onChange={(e) => {
                        const nc = classes.map(x => x.id === c.id ? { ...x, name: e.target.value } : x);
                        onField('classes', nc);
                      }}
                      placeholder={classPlaceholder(c)}
                      title="Class names are editable — rename to match your system (e.g. sewer classes)"
                      style={{ fontSize: 11, padding: '2px 6px', border: 'none', background: 'transparent', width: '100%', color: 'inherit' }}
                      onClick={(e) => e.stopPropagation()}
                    />
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
          <div style={{ flex: 1, minWidth: 340 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: 'var(--teal)' }}>{sel.name || classPlaceholder(sel)}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {tab !== 'cmp' && (
                    <button
                      className="btn b-out btn-xs"
                      onClick={() => setConfirmCopy({ kind: 'one', id: sel.id })}
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
                  onTierGal={(i, val) => {
                    // The Compare row shows ONE breakpoint for both columns, so
                    // editing it must move the block on BOTH sides in a single
                    // update — patching only one side silently desyncs the
                    // other and the row keeps displaying the current side's
                    // value as if they matched.
                    const patchSide = (s) => {
                      const arr = (s?.tiers || []).map(t => ({ ...t }));
                      while (arr.length <= i) arr.push({ gal: 1000 * (arr.length + 1), rate: '' });
                      arr[i] = { ...arr[i], gal: val };
                      return arr;
                    };
                    onField('classes', classes.map(c => c.id === sel.id
                      ? { ...c, cur: { ...c.cur, tiers: patchSide(c.cur) }, prop: { ...c.prop, tiers: patchSide(c.prop) } }
                      : c));
                  }}
                />
              ) : (
                <>
                  {tab === 'prop' && !distActive && nv(d.customers) === 0 && nv(sel.cur?.customers) > 0 && (
                    <div className="al al-w" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span>
                        <strong>No customers on the Proposed side yet</strong> — proposed revenue will read $0.00
                        until customer and gallon counts are entered here too.
                      </span>
                      <button
                        className="btn b-lime btn-sm"
                        onClick={() => {
                          onField('classes', classes.map(c => c.id === sel.id
                            ? { ...c, prop: { ...c.prop, customers: c.cur?.customers || '', gallonsSold: c.cur?.gallonsSold || '' } }
                            : c));
                        }}
                      >
                        Copy customers & gallons from Current
                      </button>
                    </div>
                  )}
                  <div className="g3" style={{ marginBottom: 14 }}>
                    <F
                      label="Number of Customers"
                      hint={distActive ? 'Derived from the usage distribution below' : undefined}
                    >
                      {distActive ? (
                        <input className="inp" value={fmt.n(effCust)} disabled title="Derived from the usage distribution below" />
                      ) : (
                        <input
                          className="inp"
                          type="number"
                          min="0"
                          value={d.customers}
                          onChange={(e) => updClass(sel.id, [tab, 'customers'], e.target.value)}
                        />
                      )}
                    </F>
                    <F
                      label="Total Monthly Gallons Sold"
                      hint={distActive ? 'Derived from the usage distribution below' : 'Across all customers in this class'}
                    >
                      {distActive ? (
                        <input className="inp" value={fmt.n(effGal)} disabled title="Derived from the usage distribution below" />
                      ) : (
                        <input
                          className="inp"
                          type="number"
                          min="0"
                          value={d.gallonsSold || ''}
                          onChange={(e) => updClass(sel.id, [tab, 'gallonsSold'], e.target.value)}
                          placeholder="0"
                        />
                      )}
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
                  <UsageTable
                    usage={sel.usage || []}
                    onChange={(u) => updClass(sel.id, ['usage'], u)}
                    curSide={sel.cur}
                    propSide={sel.prop}
                  />
                  {(distActive || (nv(d.customers) > 0 && nv(d.gallonsSold) > 0)) && (
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
                          <div style={{ fontSize: 18, color: 'var(--teal)' }}>{effCust > 0 ? fmt.n(Math.round(effGal / effCust)) : '—'} gal</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Avg Monthly Bill</div>
                          <div style={{ fontSize: 18, color: 'var(--teal)' }}>{effCust > 0 ? fmt.c(classMonthlyIncome(sel, tab === 'prop').monthly / effCust) : '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Revenue Basis</div>
                          <div style={{ fontSize: 13, color: distActive ? 'var(--lime-dim)' : 'var(--amber)', paddingTop: 4 }}>
                            {distActive ? 'Usage distribution' : 'Class average (approx.)'}
                          </div>
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
                    const pct = ci.monthly > 0 ? chg / ci.monthly : null;
                    return (
                      <tr key={c.id}>
                        <td>
                          {c.name || classPlaceholder(c)}
                          {hasUsageDistribution(c) && <span title="Revenue computed from usage distribution" style={{ marginLeft: 5, fontSize: 9, color: 'var(--lime-dim)' }}>◈ dist</span>}
                        </td>
                        <td>{fmt.n(classCustomers(c, true) || classCustomers(c, false))}</td>
                        <td style={{ textAlign: 'right' }}>{fmt.c(ci.monthly)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt.c(pi.monthly)}</td>
                        <td style={{ textAlign: 'right', color: chg >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
                          {chg >= 0 ? '+' : ''}{fmt.c(chg)}
                        </td>
                        <td style={{ textAlign: 'right' }}>{pct == null ? '—' : (pct * 100).toFixed(1) + '%'}</td>
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

// Derived value for locked (distribution-driven) compare rows.
const classCustomersOrGallons = (cls, isProposed, key) =>
  key === 'customers' ? classCustomers(cls, isProposed) : classGallons(cls, isProposed);

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

function CompareView({ cls, mhi, onUpd, onTier, onTierGal }) {
  const hml = mhi ? calcHML({ prop: { minCharge: cls.prop?.minCharge, tiers: cls.prop?.tiers || [] } }, true, mhi) : null;
  const cur = cls.cur || {};
  const prop = cls.prop || {};
  const distActive = hasUsageDistribution(cls);
  const tierMax = Math.max((cur.tiers || []).length, (prop.tiers || []).length, 1);
  const tiers = [];
  for (let i = 0; i < tierMax; i++) {
    tiers.push({
      gal: cur.tiers?.[i]?.gal ?? prop.tiers?.[i]?.gal ?? 1000 * (i + 1),
      curRate: cur.tiers?.[i]?.rate,
      propRate: prop.tiers?.[i]?.rate,
    });
  }
  // Index-paired editing is only honest when both sides have the same real
  // breakpoints. Compare on the billed (normalized) tiers, not the raw
  // padded slots — empty default rows shouldn't count as a mismatch.
  const curNorm = normalizeTiers(cur.tiers);
  const propNorm = normalizeTiers(prop.tiers);
  const tiersAligned =
    curNorm.length === 0 || propNorm.length === 0 ||
    (curNorm.length === propNorm.length && curNorm.every((t, i) => t.gal === propNorm[i].gal));
  const unionTiers = tiersAligned ? [] : (rateStructureComparison([{ ...cls, enabled: true }])[0]?.tiers || []);
  const ci = classMonthlyIncome(cls, false);
  const pi = classMonthlyIncome(cls, true);
  const billRow = (gal) => {
    const c = calcBill(cur.minCharge, cur.tiers || [], gal);
    const p = calcBill(prop.minCharge, prop.tiers || [], gal);
    return { gal, c, p, d: p - c };
  };
  const samples = [2000, 5000, 10000, 20000].map(billRow);

  const fields = [
    { label: 'Number of Customers', curVal: cur.customers, propVal: prop.customers, key: 'customers', money: false, step: '1', derived: distActive },
    { label: 'Monthly Gallons Sold', curVal: cur.gallonsSold, propVal: prop.gallonsSold, key: 'gallonsSold', money: false, step: '100', derived: distActive },
    { label: 'Base / Minimum Charge', curVal: cur.minCharge, propVal: prop.minCharge, key: 'minCharge', money: true, step: '0.01' },
  ];

  // No `color` override in inline style unless explicitly passed — `.dt th`
  // already sets a light, readable color against the table header's dark
  // teal background; forcing `color: inherit` here (the previous behavior)
  // overrode that with the page's default near-black text color, making
  // every one of these header cells nearly unreadable against the teal.
  const colHeader = (text, color) => (
    <th style={{ textAlign: 'right', ...(color ? { color } : {}) }}>{text}</th>
  );

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
        Edit either column directly. The Δ column updates as you change values; the calculated income row recomputes from your latest inputs.
        In the tier table, the Block (gal) breakpoint applies to <em>both</em> columns — to give one side different breakpoints, edit that side on its own tab.
        {distActive && <> Customer counts and gallons derive from this class's usage distribution (edit it on the Current/Proposed tab), so those rows are locked here.</>}
      </p>
      {hml && (
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div className="flb" style={{ marginBottom: 6 }}>Recommended Proposed Base Charge (% of Monthly MHI)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn b-low btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.low.toFixed(2))}>
              Low — {fmt.c(hml.low)} <span style={{ fontSize: 10 }}>(1.5% of MHI)</span>
            </button>
            <button className="btn b-med btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.med.toFixed(2))}>
              Medium — {fmt.c(hml.med)} <span style={{ fontSize: 10 }}>(2.0% of MHI)</span>
            </button>
            <button className="btn b-hi btn-sm" onClick={() => onUpd('prop', 'minCharge', hml.high.toFixed(2))}>
              High — {fmt.c(hml.high)} <span style={{ fontSize: 10 }}>(2.5% of MHI)</span>
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 5 }}>
            USDA RD grant assistance generally targets systems whose water cost exceeds 1.5% of MHI; below 2.0% is considered affordable.
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
            const curShown = f.derived ? classCustomersOrGallons(cls, false, f.key) : f.curVal;
            const propShown = f.derived ? classCustomersOrGallons(cls, true, f.key) : f.propVal;
            const d = nv(propShown) - nv(curShown);
            const fmtVal = f.money ? fmt.c : fmt.n;
            return (
              <tr key={f.key}>
                <td style={{ verticalAlign: 'middle' }}>
                  {f.label}
                  {f.derived && <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--lime-dim)' }} title="Derived from usage distribution">◈ dist</span>}
                </td>
                <td style={{ width: 130 }}>
                  {f.derived
                    ? <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--mid)', padding: '4px 6px' }}>{fmt.n(curShown)}</div>
                    : <CmpInput value={f.curVal} onChange={(v) => onUpd('cur', f.key, v)} money={f.money} step={f.step} />}
                </td>
                <td style={{ width: 130 }}>
                  {f.derived
                    ? <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--mid)', padding: '4px 6px' }}>{fmt.n(propShown)}</div>
                    : <CmpInput value={f.propVal} onChange={(v) => onUpd('prop', f.key, v)} money={f.money} step={f.step} />}
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
      {tiersAligned ? (
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
                    <CmpInput value={t.gal} onChange={(v) => onTierGal(i, Number(v))} step="1000" />
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
      ) : (
        /* The sides use different breakpoints, so pairing rows by position
           would compare unrelated gallon levels (e.g. show a 2,000-gal rate
           against a 10,000-gal rate on one line). Show the union-of-
           breakpoints comparison instead — each side's effective rate at
           every real breakpoint — the same logic the Final Report uses. */
        <div style={{ marginBottom: 14 }}>
          <div className="al al-i" style={{ fontSize: 11.5, marginBottom: 8 }}>
            Current and Proposed use <strong>different block breakpoints</strong>, so this comparison shows each
            side's effective rate at every breakpoint (read-only). To change the blocks themselves, edit each
            side on its own tab.
          </div>
          <table className="dt">
            <thead>
              <tr>
                <th>Block</th>
                {colHeader('Current ($/1k)')}
                {colHeader('Proposed ($/1k)')}
                {colHeader('Δ')}
              </tr>
            </thead>
            <tbody>
              {unionTiers.map((t) => (
                <tr key={t.gal}>
                  <td>{t.label ? `${t.label} (up to ${fmt.n(t.gal)} gal)` : `Up to ${fmt.n(t.gal)} gal`}</td>
                  <td style={{ textAlign: 'right' }}>{t.cur == null ? '—' : fmt.r(t.cur)}</td>
                  <td style={{ textAlign: 'right' }}>{t.prop == null ? '—' : fmt.r(t.prop)}</td>
                  <td style={{ textAlign: 'right', color: (t.delta ?? 0) > 0 ? 'var(--red)' : (t.delta ?? 0) < 0 ? 'var(--lime-dim)' : 'var(--mid)', fontFamily: 'monospace', fontSize: 11.5 }}>
                    {t.delta == null || t.delta === 0 ? '—' : (t.delta > 0 ? '+' : '') + fmt.r(t.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
