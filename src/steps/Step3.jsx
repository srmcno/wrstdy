import { useState } from 'react';
import { budgetTotal, totalRevenue, nv, fmt } from '../lib/calc.js';
import { defBudget } from '../lib/state.js';
import { BudgetSection } from '../components/BudgetSection.jsx';

const SECTIONS = [
  { title: 'Employee Expenses', section: 'emp', fields: [
    { k: 'salaries', l: 'Salaries' }, { k: 'healthIns', l: 'Health Insurance' },
    { k: 'retirement', l: 'Retirement' }, { k: 'uniforms', l: 'Uniforms' },
    { k: 'workersComp', l: 'Workers Comp' }, { k: 'contractLabor', l: 'Contract Labor' },
    { k: 'other1', l: 'Other' }, { k: 'other2', l: 'Other' }
  ] },
  { title: 'Office Expenses', section: 'ofc', fields: [
    { k: 'rent', l: 'Rent' }, { k: 'electric', l: 'Electric' },
    { k: 'naturalGas', l: 'Natural Gas' }, { k: 'phone', l: 'Phone' },
    { k: 'equipment', l: 'Office Equipment' }, { k: 'supplies', l: 'Supplies' },
    { k: 'audit', l: 'Audit / Accounting' },
    { k: 'other1', l: 'Other' }, { k: 'other2', l: 'Other' }
  ] },
  { title: 'Plant Expenses', section: 'plt', fields: [
    { k: 'tools', l: 'Tools / Equipment' }, { k: 'chemicals', l: 'Chemicals' },
    { k: 'utilities', l: 'All Utilities' }, { k: 'treatment', l: 'Treatment' },
    { k: 'other', l: 'Other' }
  ] },
  { title: 'Distribution Expenses', section: 'dst', fields: [
    { k: 'tools', l: 'Tools / Equipment' }, { k: 'parts', l: 'Parts / Supplies' },
    { k: 'chemicals', l: 'Chemicals' }, { k: 'utilities', l: 'Utilities' },
    { k: 'other1', l: 'Other' }, { k: 'other2', l: 'Other' }
  ] },
  { title: 'Vehicle Expenses', section: 'veh', fields: [
    { k: 'maint', l: 'Maint / Repairs' }, { k: 'fuel', l: 'Fuel / Oil' },
    { k: 'insurance', l: 'Insurance' },
    { k: 'other1', l: 'Other' }, { k: 'other2', l: 'Other' }
  ] },
  { title: 'Loan / Debt Payments', section: 'loa', fields: [
    { k: 'newLoan', l: 'New Loan' }, { k: 'owrb', l: 'OWRB' },
    { k: 'bank', l: 'Bank / Credit Cards' }, { k: 'other', l: 'Other' }
  ] },
  { title: 'Other Expenses', section: 'oth', fields: [
    { k: 'depreciation', l: 'Depreciation' }, { k: 'longRange', l: 'Long Range Plan' },
    { k: 'insurance', l: 'Insurance' }, { k: 'membership', l: 'Membership Dues' },
    { k: 'purchasedWater', l: 'Purchased Water' }, { k: 'attorney', l: 'Attorney' },
    { k: 'engineer', l: 'Engineer / Consultant' }, { k: 'other', l: 'Other' }
  ] }
];

// Deep-clone a budget so editing one side doesn't mutate the other.
const cloneBudget = (b) => {
  const out = {};
  for (const k of Object.keys(b)) out[k] = { ...b[k] };
  return out;
};

export function Step3({ study, onField }) {
  const [tab, setTab] = useState('cur'); // 'cur' | 'prop' | 'cmp'
  const curB = study.curBudget || defBudget();
  const propB = study.propBudget || defBudget();
  const budget = tab === 'prop' ? propB : curB;
  const budgetKey = tab === 'prop' ? 'propBudget' : 'curBudget';
  const upd = (section, k, v) => onField(budgetKey, { ...budget, [section]: { ...budget[section], [k]: v } });
  const tots = budgetTotal(budget);
  const revCur = totalRevenue(study.classes, false);
  const revProp = totalRevenue(study.classes, true);
  const rev = tab === 'prop' ? revProp.monthly : revCur.monthly;
  const net = rev - tots.total;

  const copyCurToProp = () => {
    if (!window.confirm('Overwrite the entire Proposed Budget with the Current Budget? You can then edit the deltas.')) return;
    onField('propBudget', cloneBudget(curB));
  };

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Monthly Budget</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>Monthly expense figures for current and proposed budgets. Enter all amounts as monthly values.</p>
        </div>
        <button className="btn b-out btn-sm" onClick={copyCurToProp} title="Copy entire current budget to proposed">⇉ Copy Cur→Prop</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button className={'sub-tab' + (tab === 'cur' ? ' on' : '')} onClick={() => setTab('cur')}>Current Budget</button>
        <button className={'sub-tab' + (tab === 'prop' ? ' on' : '')} onClick={() => setTab('prop')}>Proposed Budget</button>
        <button className={'sub-tab' + (tab === 'cmp' ? ' on' : '')} onClick={() => setTab('cmp')}>Compare</button>
      </div>
      {tab === 'cmp' ? (
        <BudgetCompare cur={curB} prop={propB} sections={SECTIONS} />
      ) : (
        SECTIONS.map(s => (
          <BudgetSection
            key={s.section}
            title={s.title}
            fields={s.fields}
            data={budget[s.section]}
            onChange={(k, v) => upd(s.section, k, v)}
          />
        ))
      )}
      <div className="rbar">
        {[
          { l: 'Total Expenses', v: fmt.c(tots.total) },
          { l: 'Monthly Income', v: fmt.c(rev) },
          { l: 'Surplus / (Deficit)', v: (net >= 0 ? '+' : '') + fmt.c(net) }
        ].map(({ l, v }, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div className="rlb">{l}</div>
            <div className={i === 2 ? (net >= 0 ? 'rn' : 'rv') : 'rv'} style={i === 2 && net < 0 ? { color: '#fca5a5' } : {}}>{v}</div>
          </div>
        ))}
        <div className="rdiv" />
        <div style={{ textAlign: 'center' }}>
          <div className="rlb">Operating Ratio</div>
          <div className="rn">{tots.total > 0 ? (rev / tots.total).toFixed(2) : '—'}</div>
        </div>
      </div>
    </div>
  );
}

function BudgetCompare({ cur, prop, sections }) {
  const ct = budgetTotal(cur);
  const pt = budgetTotal(prop);
  return (
    <div className="card">
      <div className="sh">Current vs. Proposed — Line by Line</div>
      <table className="dt">
        <thead>
          <tr>
            <th>Line Item</th>
            <th style={{ textAlign: 'right' }}>Current</th>
            <th style={{ textAlign: 'right' }}>Proposed</th>
            <th style={{ textAlign: 'right' }}>$ Change</th>
            <th style={{ textAlign: 'right' }}>% Change</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(s => {
            const sectionCurTotal = s.fields.reduce((a, f) => a + nv(cur[s.section]?.[f.k]), 0);
            const sectionPropTotal = s.fields.reduce((a, f) => a + nv(prop[s.section]?.[f.k]), 0);
            const rows = [
              <tr key={s.section + '_h'} style={{ background: 'var(--surface)' }}>
                <td colSpan={5} style={{ fontWeight: 600, color: 'var(--teal)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {s.title}
                </td>
              </tr>
            ];
            s.fields.forEach(f => {
              const c = nv(cur[s.section]?.[f.k]);
              const p = nv(prop[s.section]?.[f.k]);
              if (c === 0 && p === 0) return;
              const d = p - c;
              const pct = c > 0 ? (d / c) * 100 : (p > 0 ? 100 : 0);
              rows.push(
                <tr key={s.section + f.k}>
                  <td style={{ paddingLeft: 24 }}>{f.l}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(c)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(p)}</td>
                  <td style={{ textAlign: 'right', color: d > 0 ? 'var(--red)' : d < 0 ? 'var(--lime-dim)' : 'var(--mid)' }}>
                    {d === 0 ? '—' : (d > 0 ? '+' : '') + fmt.c(d)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--mid)' }}>
                    {c === 0 && p === 0 ? '—' : pct.toFixed(1) + '%'}
                  </td>
                </tr>
              );
            });
            const sd = sectionPropTotal - sectionCurTotal;
            rows.push(
              <tr key={s.section + '_t'} className="tr-s">
                <td>Subtotal — {s.title}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(sectionCurTotal)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(sectionPropTotal)}</td>
                <td style={{ textAlign: 'right', color: sd > 0 ? 'var(--red)' : sd < 0 ? 'var(--lime-dim)' : 'var(--mid)' }}>
                  {sd === 0 ? '—' : (sd > 0 ? '+' : '') + fmt.c(sd)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {sectionCurTotal > 0 ? ((sd / sectionCurTotal) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            );
            return rows;
          })}
        </tbody>
        <tfoot>
          <tr className="tr-t">
            <td>Total Monthly Expenses</td>
            <td style={{ textAlign: 'right' }}>{fmt.c(ct.total)}</td>
            <td style={{ textAlign: 'right' }}>{fmt.c(pt.total)}</td>
            <td style={{ textAlign: 'right' }}>
              {pt.total - ct.total >= 0 ? '+' : ''}{fmt.c(pt.total - ct.total)}
            </td>
            <td style={{ textAlign: 'right' }}>
              {ct.total > 0 ? ((pt.total - ct.total) / ct.total * 100).toFixed(1) + '%' : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
