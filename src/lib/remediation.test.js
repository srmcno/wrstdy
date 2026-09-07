import test from 'node:test';
import assert from 'node:assert/strict';
import { calc5Yr, operatingExpenses, nv } from './calc.js';
import { validateStudy } from './validate.js';
import { createPowerAppsHost, MAX_TEXT_PROPERTY_CHARS } from '../platform/pcfHost.js';

test('explicit all-zero debt schedule overrides debt in BOTH budgets', () => {
  const p = calc5Yr([], { emp: { salaries: 100 }, loa: { bank: 25 } }, { emp: { salaries: 200 }, loa: { bank: 50 } }, { inflationRate: 10, debtService: [0, '0', 0, '0', 0] });
  assert.deepEqual(p.debtArr, [0, 0, 0, 0, 0]);
  assert.equal(p.curExpArr[0], 1200);
  assert.equal(p.propExpArr[0], 2400);
  assert.ok(Math.abs(p.propExpArr[1] - 2640) < 1e-9);
});
test('blank debt years use fixed track-specific budget debt', () => {
  const p = calc5Yr([], { loa: { bank: 25 } }, { loa: { bank: 50 } }, { inflationRate: 25, debtService: ['', 0, '', '', ''] });
  assert.deepEqual(p.curExpArr, [300, 0, 300, 300, 300]);
  assert.deepEqual(p.propExpArr, [600, 0, 600, 600, 600]);
});
test('negative early-year cash is flagged even when a later grant restores it', () => {
  const s = { propBudget: { emp: { salaries: 100 } }, forecast: { inflationRate: 0, beginFundBalance: 0, knownItems: [{ vals: [0, -10000, 0, 0, 0] }] } };
  const issue = validateStudy(s).find(f => f.id === 'fb-negative');
  assert.ok(issue);
  assert.match(issue.detail, /FY1/);
});
test('blank fund target uses the same default as the chart', () => {
  const s = { propBudget: { emp: { salaries: 10 } }, forecast: { inflationRate: 0, beginFundBalance: 3000, targetFundBalance: '' } };
  assert.ok(validateStudy(s).some(f => f.id === 'fb-below-target'));
});
test('reserve target O&M excludes debt and cash reserve transfers', () => {
  assert.equal(operatingExpenses({ emp: { salaries: 100 }, loa: { bank: 50 }, oth: { depreciation: 20, longRange: 30, insurance: 10 } }), 110);
});
test('malformed imported values and duplicate tiers are visible errors', () => {
  const s = { classes: [{ id: 'res', name: 'Water', enabled: true, cur: { minCharge: '12oops', tiers: [{gal:1000,rate:3},{gal:1000,rate:4}] }, prop: { minCharge: -20 } }] };
  const issues = validateStudy(s);
  assert.ok(issues.some(f => f.id.startsWith('numeric-') && f.severity === 'error'));
  assert.ok(issues.some(f => f.id.startsWith('duplicate-')));
  assert.equal(nv('12oops'), 0);
});
test('Power Apps does not emit an oversized study payload', () => {
  let wrote = false;
  const host = createPowerAppsHost({ readStudies: () => [], writeStudies: () => { wrote = true; } });
  assert.throws(() => host.saveStudies([{ content: 'x'.repeat(MAX_TEXT_PROPERTY_CHARS) }]), /limit/);
  assert.equal(wrote, false);
});
