import { useState } from 'react';
import { budgetTotal, totalRevenue, fmt } from '../lib/calc.js';
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

export function Step3({ study, onField }) {
  const [tab, setTab] = useState('cur');
  const budget = tab === 'cur' ? study.curBudget : study.propBudget;
  const budgetKey = tab === 'cur' ? 'curBudget' : 'propBudget';
  const upd = (section, k, v) => onField(budgetKey, { ...budget, [section]: { ...budget[section], [k]: v } });
  const tots = budgetTotal(budget);
  const revCur = totalRevenue(study.classes, false);
  const revProp = totalRevenue(study.classes, true);
  const rev = tab === 'cur' ? revCur.monthly : revProp.monthly;
  const net = rev - tots.total;
  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Monthly Budget</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Monthly expense figures for current and proposed budgets. Enter all amounts as monthly values.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button className={'sub-tab' + (tab === 'cur' ? ' on' : '')} onClick={() => setTab('cur')}>Current Budget</button>
        <button className={'sub-tab' + (tab === 'prop' ? ' on' : '')} onClick={() => setTab('prop')}>Proposed Budget</button>
      </div>
      {SECTIONS.map(s => (
        <BudgetSection
          key={s.section}
          title={s.title}
          fields={s.fields}
          data={budget[s.section]}
          onChange={(k, v) => upd(s.section, k, v)}
        />
      ))}
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
