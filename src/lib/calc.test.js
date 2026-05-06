import test from 'node:test';
import assert from 'node:assert/strict';

import { calcBill, tierTopAmounts } from './calc.js';

test('tierTopAmounts preserves cumulative bills for default 1,000-gallon tier blocks', () => {
  const minCharge = '10';
  const tiers = [
    { gal: 1000, rate: '4.25' },
    { gal: 2000, rate: '4.75' },
    { gal: 3000, rate: '5.25' },
  ];

  assert.deepEqual(tierTopAmounts(minCharge, tiers), [14.25, 19, 24.25]);
});

test('tierTopAmounts uses each tier cumulative gallon breakpoint', () => {
  const minCharge = '10';
  const tiers = [
    { gal: 2000, rate: '4' },
    { gal: 5000, rate: '6' },
    { gal: 10000, rate: '8' },
  ];

  assert.deepEqual(
    tierTopAmounts(minCharge, tiers),
    tiers.map(t => calcBill(minCharge, tiers, t.gal)),
  );
  assert.deepEqual(tierTopAmounts(minCharge, tiers), [18, 36, 76]);
});

import { budgetTotal, classMonthlyIncome, totalRevenue } from './calc.js';
import { normalizeStudy } from './state.js';

test('normalizes incomplete imported studies so button-driven calculations do not crash', () => {
  const study = normalizeStudy({
    name: 'Legacy import',
    classes: [{ id: 'res', enabled: true, cur: { customers: '10' } }],
    curBudget: { emp: { salaries: '100' } },
    forecast: { knownItems: [{ label: 'Grant' }] },
  });

  assert.equal(study.classes.find(c => c.id === 'res').cur.tiers.length, 6);
  assert.equal(study.classes.find(c => c.id === 'res').prop.minCharge, '');
  assert.equal(study.curBudget.ofc.rent, '');
  assert.deepEqual(study.forecast.knownItems[0].vals, ['', '', '', '', '']);
});

test('calculation helpers tolerate partially populated classes and budgets', () => {
  assert.deepEqual(classMonthlyIncome({ enabled: true }, true), { monthly: 0, annual: 0, fixed: 0, volumetric: 0 });
  assert.equal(totalRevenue([{ enabled: true }], true).monthly, 0);
  assert.equal(budgetTotal({ emp: { salaries: '10' } }).total, 10);
});
