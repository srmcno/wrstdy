import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nv, fmt, targetFundBalance, forecastInflation, monthlyDebtService,
  calc5Yr, DEFAULT_TARGET_FUND_BALANCE,
} from './calc.js';
import { resolvePatch } from './state.js';

// ─── nv: numeric coercion of everything a user or import can produce ────────

test('nv strips currency punctuation instead of truncating at the comma', () => {
  // parseFloat('1,234') is 1 — the old behaviour turned a $1,234 budget line
  // into $1 whenever a value was pasted from a spreadsheet or produced by the
  // AI estimate, with no error anywhere.
  assert.equal(nv('1,234'), 1234);
  assert.equal(nv('$1,234.56'), 1234.56);
  assert.equal(nv(' $ 12,345.00 '), 12345);
  assert.equal(nv('45,000'), 45000);
});

test('nv reads the accounting form of a negative', () => {
  assert.equal(nv('(1,234.50)'), -1234.5);
  assert.equal(nv('($500)'), -500);
});

test('nv leaves ordinary values alone and never yields NaN', () => {
  assert.equal(nv('12.5'), 12.5);
  assert.equal(nv(12.5), 12.5);
  assert.equal(nv(-3), -3);
  assert.equal(nv(''), 0);
  assert.equal(nv(null), 0);
  assert.equal(nv(undefined), 0);
  assert.equal(nv('abc'), 0);
  assert.equal(nv(NaN), 0);
  assert.equal(nv(Infinity), 0);
  assert.equal(nv({}), 0);
});

// ─── fmt: how the numbers reach a board packet ──────────────────────────────

test('currency puts the sign outside the dollar symbol', () => {
  // "$-1,234.00" reads as a typo in a board document; every accounting
  // package writes "-$1,234.00".
  assert.equal(fmt.c(-1234), '-$1,234.00');
  assert.equal(fmt.c(1234), '$1,234.00');
  assert.equal(fmt.c(0), '$0.00');
  assert.equal(fmt.c(-0.5), '-$0.50');
});

test('fmt.r formats rates with separators and the same sign handling', () => {
  assert.equal(fmt.r(4.5), '$4.50');
  assert.equal(fmt.r(-0.25), '-$0.25');
  assert.equal(fmt.r(1200), '$1,200.00');
});

test('fmt.signed always carries an explicit sign for delta columns', () => {
  assert.equal(fmt.signed(120), '+$120.00');
  assert.equal(fmt.signed(-120), '-$120.00');
  assert.equal(fmt.signed(0), '$0.00');
});

test('fmt.pctOf refuses to divide by a zero base', () => {
  assert.equal(fmt.pctOf(50, 200), '+25.0%');
  assert.equal(fmt.pctOf(-50, 200), '-25.0%');
  assert.equal(fmt.pctOf(50, 0), '—');
  assert.equal(fmt.pctOf(50, 0, 'New'), 'New');
});

test('fmt.n rounds counts rather than showing fractional customers', () => {
  assert.equal(fmt.n(1234.6), '1,235');
  assert.equal(fmt.n('12,000'), '12,000');
});

test('date formatters render nothing for an unparseable value', () => {
  // These reached the sidebar and the PDF header as the literal string
  // "Invalid Date" whenever a study carried a partial or corrupted timestamp.
  assert.equal(fmt.date('not a date'), '');
  assert.equal(fmt.short('not a date'), '');
  assert.equal(fmt.date(''), '');
  assert.equal(fmt.date(null), '');
  assert.match(fmt.date('2026-03-15T00:00:00.000Z'), /2026/);
});

// ─── Forecast defaults, shared by every consumer ─────────────────────────────

test('targetFundBalance defaults only when the field is blank', () => {
  assert.equal(targetFundBalance({}), DEFAULT_TARGET_FUND_BALANCE);
  assert.equal(targetFundBalance({ targetFundBalance: '' }), DEFAULT_TARGET_FUND_BALANCE);
  assert.equal(targetFundBalance({ targetFundBalance: '   ' }), DEFAULT_TARGET_FUND_BALANCE);
  // An explicit zero is a real answer, not a missing one.
  assert.equal(targetFundBalance({ targetFundBalance: '0' }), 0);
  assert.equal(targetFundBalance({ targetFundBalance: 0 }), 0);
  assert.equal(targetFundBalance({ targetFundBalance: '25,000' }), 25000);
});

test('calc5Yr projects the same target the UI labels', () => {
  // These disagreed: calc5Yr read nv(targetFundBalance) → 0 for a blank field
  // while every label read `|| 5000`, so the chart drew its target line at $0
  // beside a caption reading "$5,000.00".
  const proj = calc5Yr([], {}, {}, {});
  assert.deepEqual(proj.targetArr, Array(5).fill(DEFAULT_TARGET_FUND_BALANCE));
});

test('forecastInflation keeps an explicit zero and defaults a blank', () => {
  assert.equal(forecastInflation({}), 3);
  assert.equal(forecastInflation({ inflationRate: '' }), 3);
  assert.equal(forecastInflation({ inflationRate: '0' }), 0);
  assert.equal(forecastInflation({ inflationRate: '4.5' }), 4.5);
});

test('a catastrophic growth assumption cannot flip the projection sign', () => {
  // Math.pow with a negative base alternates sign year over year, which drew a
  // projection oscillating between profit and loss with no explanation.
  const proj = calc5Yr([], { emp: { salaries: '1000' } }, { emp: { salaries: '1000' } }, {
    inflationRate: '-250',
  });
  for (const v of proj.propExpArr) assert.ok(v >= 0, `expense ${v} should never be negative`);
  assert.equal(proj.propExpArr[1], 0);
});

// ─── Debt service ───────────────────────────────────────────────────────────

test('monthlyDebtService sums the whole loan section, not four fixed keys', () => {
  const budget = { loa: { newLoan: '100', owrb: '200', bank: '50', other: '25', refinance: '75' } };
  assert.equal(monthlyDebtService(budget), 450);
});

// ─── Patch resolution (async writers vs. concurrent edits) ──────────────────

test('resolvePatch passes plain values straight through', () => {
  assert.deepEqual(resolvePatch({ a: 1 }, { b: 2, c: 'x' }), { b: 2, c: 'x' });
});

test('resolvePatch calls a function value with the CURRENT value', () => {
  // This is what stops an AI helper from reverting the user's typing: the
  // helper captured `systemInfo` before an await that ran for several seconds,
  // and merging against the value at commit time keeps both changes.
  const current = { systemInfo: { systemName: 'Typed while waiting', pwsId: '' } };
  const patch = { systemInfo: (cur) => ({ ...cur, pwsId: 'OK1234567' }) };
  assert.deepEqual(resolvePatch(current, patch), {
    systemInfo: { systemName: 'Typed while waiting', pwsId: 'OK1234567' },
  });
});

test('resolvePatch tolerates a key that does not exist yet', () => {
  const patch = { demographics: (cur) => ({ ...(cur || {}), medianMonthlyHHI: '3000' }) };
  assert.deepEqual(resolvePatch({}, patch), { demographics: { medianMonthlyHHI: '3000' } });
});

test('resolvePatch handles mixed function and plain values in one patch', () => {
  const current = { systemInfo: { a: 1 }, status: 'draft' };
  const out = resolvePatch(current, {
    systemInfo: (cur) => ({ ...cur, b: 2 }),
    status: 'in-progress',
  });
  assert.deepEqual(out, { systemInfo: { a: 1, b: 2 }, status: 'in-progress' });
});

test('resolvePatch never mutates the study it reads from', () => {
  const current = { systemInfo: { a: 1 } };
  resolvePatch(current, { systemInfo: (cur) => ({ ...cur, b: 2 }) });
  assert.deepEqual(current, { systemInfo: { a: 1 } });
});

test('resolvePatch copes with an empty or absent patch', () => {
  assert.deepEqual(resolvePatch({ a: 1 }, {}), {});
  assert.deepEqual(resolvePatch({ a: 1 }), {});
  assert.deepEqual(resolvePatch(), {});
});
