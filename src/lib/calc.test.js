import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcBill, tierTopAmounts, normalizeTiers,
  budgetTotal, classMonthlyIncome, totalRevenue, totalGallons,
  classCustomers, classGallons, hasUsageDistribution,
  operatingRatio, affordabilityIndex, debtToIncome, baseCoverage,
  debtServiceCoverage, costPer1000, cost5000, trueCostOfService,
  calc5Yr, calcHML, billImpactForClass, billImpactExamples, rateStructureComparison,
} from './calc.js';
import { normalizeStudy } from './state.js';

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

// ─── Tier robustness ─────────────────────────────────────────────────────────

test('calcBill bills usage far beyond the final block at the final tier rate', () => {
  const tiers = [
    { gal: 1000, rate: '4' },
    { gal: 5000, rate: '6' },
  ];
  // 1,000 @ $4 + 4,000 @ $6 + 15,000 more @ $6 (final block extends to ∞)
  assert.equal(calcBill('10', tiers, 20000), 10 + 4 + 24 + 90);
  assert.equal(calcBill('10', tiers, 40000), 10 + 4 + 24 + 210);
});

test('calcBill tolerates unsorted and duplicate tier breakpoints', () => {
  const sorted = [
    { gal: 1000, rate: '4' },
    { gal: 3000, rate: '5' },
  ];
  const unsorted = [
    { gal: 3000, rate: '5' },
    { gal: 1000, rate: '4' },
  ];
  const withDup = [
    { gal: 1000, rate: '4' },
    { gal: 1000, rate: '9' },
    { gal: 3000, rate: '5' },
  ];
  assert.equal(calcBill('0', unsorted, 3000), calcBill('0', sorted, 3000));
  assert.equal(calcBill('0', withDup, 3000), calcBill('0', sorted, 3000));
  assert.equal(calcBill('0', sorted, 3000), 4 + 10);
});

test('normalizeTiers sorts, drops zero/duplicate breakpoints, keeps labels', () => {
  const tiers = normalizeTiers([
    { gal: '3000', rate: '5', label: 'High' },
    { gal: '', rate: '9' },
    { gal: '1000', rate: '4' },
    { gal: 3000, rate: '7' },
  ]);
  assert.deepEqual(tiers.map(t => t.gal), [1000, 3000]);
  assert.equal(tiers[1].rate, 5);
  assert.equal(tiers[1].label, 'High');
});

test('calcBill supports sub-1,000-gallon blocks', () => {
  const tiers = [
    { gal: 500, rate: '4' },
    { gal: 1000, rate: '6' },
  ];
  assert.equal(calcBill('0', tiers, 750), (500 / 1000) * 4 + (250 / 1000) * 6);
});

// ─── Usage-distribution revenue engine ───────────────────────────────────────

const distClass = (usage, side) => ({
  id: 'res', enabled: true,
  usage,
  cur: side,
  prop: side,
});

test('classMonthlyIncome bills each usage bracket against the tier structure', () => {
  const side = {
    customers: '', gallonsSold: '', minCharge: '10',
    tiers: [
      { gal: 1000, rate: '4' },
      { gal: 3000, rate: '5' },
      { gal: 5000, rate: '6' },
    ],
  };
  const usage = [
    { customers: '100', gallons: '1000' },
    { customers: '50', gallons: '2000' },
    { customers: '10', gallons: '20000' },
  ];
  const c = distClass(usage, side);
  const per1000 = calcBill('10', side.tiers, 1000);   // 14
  const per2000 = calcBill('10', side.tiers, 2000);   // 19
  const per20000 = calcBill('10', side.tiers, 20000); // 10+4+10+12+ 15*6 = 126
  const expected = 100 * per1000 + 50 * per2000 + 10 * per20000;
  const inc = classMonthlyIncome(c, true);
  assert.equal(inc.monthly, expected);
  assert.equal(inc.annual, expected * 12);
  assert.equal(inc.fixed, 160 * 10);
  assert.equal(Math.round(inc.volumetric * 100) / 100, Math.round((expected - 1600) * 100) / 100);
  assert.equal(classCustomers(c, true), 160);
  assert.equal(classGallons(c, true), 100 * 1000 + 50 * 2000 + 10 * 20000);
  assert.ok(hasUsageDistribution(c));
});

test('raising a rate block above average usage increases revenue when high users exist', () => {
  // Meeting scenario: average usage ≈ 2,200 gal, so the old average-based
  // model never touched blocks above 3,000 gal. With a distribution, raising
  // the 3,000+ block must raise projected revenue.
  const tiers = (r3plus) => [
    { gal: 1000, rate: '4' },
    { gal: 2000, rate: '4.5' },
    { gal: 3000, rate: '5' },
    { gal: 10000, rate: String(r3plus) },
  ];
  const usage = [
    { customers: '100', gallons: '1000' },
    { customers: '50', gallons: '2000' },
    { customers: '25', gallons: '5000' },
    { customers: '10', gallons: '20000' },
  ];
  const mk = (r) => distClass(usage, { minCharge: '10', tiers: tiers(r) });
  const before = totalRevenue([mk(5)], true).monthly;
  const after = totalRevenue([mk(7)], true).monthly;
  // 25 customers use 2,000 gal in the raised block; 10 customers use 17,000.
  const expectedDelta = ((25 * 2000 + 10 * 17000) / 1000) * 2;
  assert.ok(after > before, 'high-block rate increase must raise revenue');
  assert.equal(Math.round((after - before) * 100) / 100, expectedDelta);

  // Sanity: average usage here is 2,216 gal — the legacy model would have
  // shown zero change from this same edit.
  const avgClass = (r) => ({
    id: 'res', enabled: true, usage: [],
    cur: { customers: '185', gallonsSold: '410000', minCharge: '10', tiers: tiers(r) },
    prop: { customers: '185', gallonsSold: '410000', minCharge: '10', tiers: tiers(r) },
  });
  const legacyBefore = totalRevenue([avgClass(5)], true).monthly;
  const legacyAfter = totalRevenue([avgClass(7)], true).monthly;
  assert.equal(legacyBefore, legacyAfter);
});

test('classes without a distribution fall back to the legacy average-usage model', () => {
  const c = {
    id: 'res', enabled: true, usage: [],
    cur: { customers: '10', gallonsSold: '50000', minCharge: '20', tiers: [{ gal: 10000, rate: '5' }] },
    prop: { customers: '10', gallonsSold: '50000', minCharge: '20', tiers: [{ gal: 10000, rate: '5' }] },
  };
  // avg 5,000 gal → bill 20 + 25 = 45 → ×10 customers
  assert.equal(classMonthlyIncome(c, false).monthly, 450);
});

test('blank usage rows are ignored; blank distribution falls back to averages', () => {
  const side = { customers: '10', gallonsSold: '10000', minCharge: '10', tiers: [{ gal: 5000, rate: '5' }] };
  const c = distClass([{ customers: '', gallons: '' }, { customers: '0', gallons: '5000' }], side);
  assert.equal(hasUsageDistribution(c), false);
  assert.equal(classMonthlyIncome(c, true).monthly, 10 * (10 + 5));
});

// ─── Normalization ───────────────────────────────────────────────────────────

test('normalizes incomplete imported studies so button-driven calculations do not crash', () => {
  const study = normalizeStudy({
    name: 'Legacy import',
    classes: [{ id: 'res', enabled: true, cur: { customers: '10' } }],
    curBudget: { emp: { salaries: '100' } },
    forecast: { knownItems: [{ label: 'Grant' }] },
  });

  assert.equal(study.classes.find(c => c.id === 'res').cur.tiers.length, 6);
  assert.equal(study.classes.find(c => c.id === 'res').prop.minCharge, '');
  assert.deepEqual(study.classes.find(c => c.id === 'res').usage, []);
  assert.equal(study.curBudget.ofc.rent, '');
  assert.deepEqual(study.forecast.knownItems[0].vals, ['', '', '', '', '']);
});

test('normalizeStudy preserves usage distributions and tier labels', () => {
  const study = normalizeStudy({
    classes: [{
      id: 'res', enabled: true,
      usage: [{ customers: '100', gallons: '1000', note: 'from billing report' }, null],
      cur: { tiers: [{ gal: 500, rate: '3', label: 'Lifeline' }] },
    }],
  });
  const res = study.classes.find(c => c.id === 'res');
  assert.deepEqual(res.usage, [{ customers: '100', gallons: '1000', note: 'from billing report' }]);
  assert.equal(res.cur.tiers[0].label, 'Lifeline');
});

test('calculation helpers tolerate partially populated classes and budgets', () => {
  assert.deepEqual(classMonthlyIncome({ enabled: true }, true), { monthly: 0, annual: 0, fixed: 0, volumetric: 0 });
  assert.equal(totalRevenue([{ enabled: true }], true).monthly, 0);
  assert.equal(budgetTotal({ emp: { salaries: '10' } }).total, 10);
});

// ─── Null-aware metrics ──────────────────────────────────────────────────────

test('metrics report null (insufficient data) instead of 0 when denominators are missing', () => {
  assert.equal(operatingRatio(1000, 0), null);
  assert.equal(operatingRatio(1000, 800), 1.25);
  assert.equal(affordabilityIndex([], true, ''), null);
  assert.equal(affordabilityIndex([], true, '0'), null);
  assert.equal(debtToIncome({ loa: { owrb: '100' } }, 0), null);
  assert.equal(baseCoverage([], true, 0), null);
  assert.equal(costPer1000({}, [], true), null);
  assert.equal(calcHML({}, true, '0'), null);
});

test('cost5000 prefers the enabled residential class', () => {
  const classes = [
    { id: 'res', enabled: false, cur: { minCharge: '99', tiers: [{ gal: 5000, rate: '9' }] } },
    { id: 'com', enabled: true, cur: { minCharge: '10', tiers: [{ gal: 5000, rate: '2' }] } },
  ];
  assert.equal(cost5000(classes, false), 10 + 10);
});

test('debtServiceCoverage nets out O&M but not debt or reserve set-asides', () => {
  const budget = {
    emp: { salaries: '4000' },
    loa: { owrb: '1000' },
    oth: { depreciation: '500', longRange: '250', insurance: '250' },
  };
  // total 6000; opEx = 6000 − 1000 debt − 750 set-asides = 4250
  // rev 6000 → net 1750 → DSCR 1.75
  assert.equal(debtServiceCoverage(budget, 6000), 1.75);
  assert.equal(debtServiceCoverage({ emp: { salaries: '100' } }, 500), null);
});

// ─── True Cost of Service ────────────────────────────────────────────────────

test('trueCostOfService reports cost vs revenue per 1,000 gallons and break-even gap', () => {
  const budget = { emp: { salaries: '5000' } }; // $60k/yr
  const classes = [{
    id: 'res', enabled: true, usage: [],
    cur: { customers: '100', gallonsSold: '500000', minCharge: '20', tiers: [{ gal: 10000, rate: '5' }] },
    prop: { customers: '100', gallonsSold: '500000', minCharge: '20', tiers: [{ gal: 10000, rate: '5' }] },
  }];
  const tcs = trueCostOfService(budget, classes, false);
  assert.equal(tcs.annualExpenses, 60000);
  assert.equal(tcs.annualGallons, 6000000);
  assert.equal(tcs.costPer1k, 10);
  // avg 5,000 gal → bill 45 → ×100 ×12 = $54k/yr → $9 per 1k gal
  assert.equal(tcs.annualRevenue, 54000);
  assert.equal(tcs.revenuePer1k, 9);
  assert.equal(tcs.gapPer1k, 1);
  assert.equal(tcs.gapAnnual, 6000);
  assert.ok(Math.abs(tcs.breakEvenAdjustment - (60000 / 54000 - 1)) < 1e-12);
});

// ─── 5-year projection ───────────────────────────────────────────────────────

const projClasses = [{
  id: 'res', enabled: true, usage: [],
  cur: { customers: '100', gallonsSold: '500000', minCharge: '20', tiers: [{ gal: 10000, rate: '4' }] },
  prop: { customers: '100', gallonsSold: '500000', minCharge: '25', tiers: [{ gal: 10000, rate: '5' }] },
}];
const budgetOf = (monthly, loa = 0, depreciation = 0) => ({
  emp: { salaries: String(monthly) },
  loa: { owrb: String(loa) },
  oth: { depreciation: String(depreciation) },
});

test('calc5Yr tracks current rates against the CURRENT budget, proposed against proposed', () => {
  const curB = budgetOf(3000);
  const propB = budgetOf(4000);
  const proj = calc5Yr(projClasses, curB, propB, { inflationRate: '0' });
  assert.equal(proj.curExpArr[0], 36000);
  assert.equal(proj.propExpArr[0], 48000);
  assert.equal(proj.expArr[0], 48000); // legacy alias = proposed track
  const curRev = totalRevenue(projClasses, false).annual;
  const propRev = totalRevenue(projClasses, true).annual;
  assert.equal(proj.curFBArr[0], curRev - 36000);
  assert.equal(proj.propFBArr[0], propRev - 48000);
});

test('calc5Yr compounds inflation from FY2 and applies growth multiplicatively', () => {
  const proj = calc5Yr(projClasses, budgetOf(1000), budgetOf(1000), {
    inflationRate: '10', revenueGrowth: '5', accountGrowth: '2',
  });
  assert.equal(proj.propExpArr[0], 12000);
  assert.ok(Math.abs(proj.propExpArr[1] - 13200) < 1e-9);
  const propRev = totalRevenue(projClasses, true).annual;
  assert.ok(Math.abs(proj.propRevArr[1] - propRev * 1.05 * 1.02) < 1e-6);
});

test('calc5Yr applies a per-year debt service schedule without double-counting budget debt', () => {
  const curB = budgetOf(3000, 1000);   // $12k/yr debt inside budget
  const propB = budgetOf(3000, 1000);
  const fc = { inflationRate: '0', debtService: ['24000', '24000', '', '', ''] };
  const proj = calc5Yr(projClasses, curB, propB, fc);
  // FY1: op (4000−1000)×12 = 36000 + scheduled 24000 = 60000
  assert.equal(proj.propExpArr[0], 60000);
  // FY3 blank falls back to the budget's loa (12000): 36000 + 12000
  assert.equal(proj.propExpArr[2], 48000);
  assert.equal(proj.debtArr[0], 24000);
  assert.equal(proj.debtArr[2], 12000);
});

test('calc5Yr folds known one-time items into that year (negative = grant/revenue)', () => {
  const fc = {
    inflationRate: '0',
    knownItems: [
      { label: 'Meter replacement', vals: ['', '15000', '', '', ''] },
      { label: 'USDA grant', vals: ['', '-10000', '', '', ''] },
    ],
  };
  const proj = calc5Yr(projClasses, budgetOf(1000), budgetOf(1000), fc);
  assert.equal(proj.knownArr[1], 5000);
  assert.equal(proj.propExpArr[1] - proj.propExpArr[0], 5000);
});

test('calc5Yr matches legacy behavior when schedule and known items are blank', () => {
  const fc = { inflationRate: '3', debtService: ['', '', '', '', ''], knownItems: [{ label: '', vals: ['', '', '', '', ''] }] };
  const proj = calc5Yr(projClasses, budgetOf(2000, 500), budgetOf(2000, 500), fc);
  assert.ok(Math.abs(proj.propExpArr[1] - 30000 * 1.03) < 1e-9);
  assert.equal(proj.knownArr[0], 0);
});

// ─── Bill impact examples ────────────────────────────────────────────────────

test('billImpactForClass bills current and proposed rates at each usage level', () => {
  const cls = {
    cur: { minCharge: '10', tiers: [{ gal: 1000, rate: '4' }, { gal: 5000, rate: '6' }] },
    prop: { minCharge: '12', tiers: [{ gal: 1000, rate: '5' }, { gal: 5000, rate: '7' }] },
  };
  const rows = billImpactForClass(cls, [1000, 5000]);
  assert.equal(rows[0].cur, calcBill('10', cls.cur.tiers, 1000));
  assert.equal(rows[0].prop, calcBill('12', cls.prop.tiers, 1000));
  assert.equal(rows[0].delta, rows[0].prop - rows[0].cur);
  assert.equal(rows[1].gal, 5000);
});

test('billImpactExamples returns one row set per enabled class, skipping disabled ones', () => {
  const classes = [
    { id: 'res', name: 'Residential Water', enabled: true, cur: { minCharge: '10', tiers: [{ gal: 1000, rate: '4' }] }, prop: { minCharge: '10', tiers: [{ gal: 1000, rate: '4' }] } },
    { id: 'com', name: 'Commercial', enabled: false, cur: { minCharge: '20', tiers: [{ gal: 1000, rate: '8' }] }, prop: { minCharge: '20', tiers: [{ gal: 1000, rate: '8' }] } },
  ];
  const out = billImpactExamples(classes, [1000]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Residential Water');
});

test('billImpactForClass reports N/A (null) for a side with no rate data entered yet', () => {
  const cls = { cur: {}, prop: { minCharge: '10', tiers: [{ gal: 1000, rate: '4' }] } };
  const [row] = billImpactForClass(cls, [1000]);
  assert.equal(row.cur, null);
  assert.equal(row.prop, calcBill('10', cls.prop.tiers, 1000));
  assert.equal(row.delta, null);
  assert.equal(row.pct, null);
});

test('billImpactForClass treats a genuine $0 base charge with real tier rates as real data, not N/A', () => {
  const cls = { cur: { minCharge: '0', tiers: [{ gal: 1000, rate: '4' }] }, prop: { minCharge: '0', tiers: [{ gal: 1000, rate: '4' }] } };
  const [row] = billImpactForClass(cls, [1000]);
  assert.equal(row.cur, 4);
  assert.equal(row.prop, 4);
});

// ─── Rate structure comparison ───────────────────────────────────────────────

test('rateStructureComparison pairs current/proposed tiers and base charge per class', () => {
  const classes = [{
    id: 'res', name: 'Residential Water', enabled: true,
    cur: { minCharge: '18', tiers: [{ gal: 1000, rate: '4.25', label: 'Lifeline' }, { gal: 2000, rate: '4.75' }] },
    prop: { minCharge: '20', tiers: [{ gal: 1000, rate: '5.00' }] },
  }];
  const [row] = rateStructureComparison(classes);
  assert.equal(row.name, 'Residential Water');
  assert.equal(row.curMinCharge, 18);
  assert.equal(row.propMinCharge, 20);
  assert.equal(row.minChargeDelta, 2);
  assert.equal(row.tiers.length, 2);
  assert.equal(row.tiers[0].label, 'Lifeline');
  assert.equal(row.tiers[0].cur, 4.25);
  assert.equal(row.tiers[0].prop, 5);
  // Proposed has no second tier — cur-only row still reports its current rate,
  // while proposed falls back to its own final tier's rate (calcBill's actual
  // billing behavior for usage beyond the last configured block).
  assert.equal(row.tiers[1].cur, 4.75);
  assert.equal(row.tiers[1].prop, 5);
});

test('rateStructureComparison reports N/A (null) for a side with no rate data entered yet', () => {
  const classes = [{
    id: 'res', name: 'Residential Water', enabled: true,
    cur: {},
    prop: { minCharge: '20', tiers: [{ gal: 1000, rate: '5.00' }] },
  }];
  const [row] = rateStructureComparison(classes);
  assert.equal(row.curMinCharge, null);
  assert.equal(row.propMinCharge, 20);
  assert.equal(row.minChargeDelta, null);
  assert.equal(row.tiers[0].cur, null);
  assert.equal(row.tiers[0].prop, 5);
  assert.equal(row.tiers[0].delta, null);
});

test('rateStructureComparison skips disabled classes', () => {
  const classes = [{ id: 'who', name: 'Wholesale', enabled: false, cur: {}, prop: {} }];
  assert.deepEqual(rateStructureComparison(classes), []);
});

test('rateStructureComparison ignores padded/invalid tier slots (gal: 0 from a cleared field) and sorts out-of-order tiers', () => {
  const classes = [{
    id: 'res', name: 'Residential Water', enabled: true,
    // normalizeStudy pads classes to 6 tier slots; a user clearing a "Block up
    // to (gal)" field mid-edit produces gal: 0 via Number(''). Also out of
    // order, as bulk-imported gal:rate pairs could be before the CSV-sort fix.
    cur: { minCharge: '10', tiers: [{ gal: 2000, rate: '5' }, { gal: 0, rate: '' }, { gal: 1000, rate: '4' }] },
    prop: { minCharge: '12', tiers: [{ gal: 1000, rate: '5' }] },
  }];
  const [row] = rateStructureComparison(classes);
  // Only the two valid tiers survive, sorted ascending — no "Up to 0 gal" row.
  assert.equal(row.tiers.length, 2);
  assert.equal(row.tiers[0].gal, 1000);
  assert.equal(row.tiers[0].cur, 4);
  assert.equal(row.tiers[1].gal, 2000);
  assert.equal(row.tiers[1].cur, 5);
  // Proposed has only one real tier — the second row falls back to it.
  assert.equal(row.tiers[1].prop, 5);
});
