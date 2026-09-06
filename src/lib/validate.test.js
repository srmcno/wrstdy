import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStudy, summarizeFindings, stepName } from './validate.js';
import { makeSampleStudy } from './sample-study.js';
import { newStudy, normalizeStudy } from './state.js';

const ids = (findings) => findings.map(f => f.id);
const has = (findings, id) => findings.some(f => f.id === id);
const find = (findings, id) => findings.find(f => f.id === id);

// The sample study is the tool's own "this is what good looks like" example —
// if it trips a blocking check, either the sample or the check is wrong.
test('the bundled sample study has no blocking findings', () => {
  const findings = validateStudy(makeSampleStudy());
  const blocking = findings.filter(f => f.severity === 'error');
  assert.deepEqual(blocking, [], `unexpected blocking findings: ${ids(blocking).join(', ')}`);
});

test('an empty study reports the things that stop it being useful', () => {
  const findings = validateStudy(newStudy('Blank'));
  assert.ok(has(findings, 'no-budget'), 'empty proposed budget is blocking');
  assert.ok(has(findings, 'system-name'));
  assert.ok(has(findings, 'mhi-missing'));
  // Residential is enabled by default but carries no rates.
  assert.ok(has(findings, 'class-no-rates-res'));
});

test('findings are ordered most severe first', () => {
  const findings = validateStudy(newStudy('Blank'));
  const rank = { error: 0, warn: 1, info: 2 };
  for (let i = 1; i < findings.length; i++) {
    assert.ok(
      rank[findings[i - 1].severity] <= rank[findings[i].severity],
      'severity must not increase down the list',
    );
  }
});

test('an annual MHI in the monthly field is blocking, not a hint', () => {
  const s = makeSampleStudy();
  s.demographics.medianMonthlyHHI = '43800'; // the annual figure
  const f = find(validateStudy(s), 'mhi-annual');
  assert.ok(f, 'expected the annual-MHI finding');
  assert.equal(f.severity, 'error');
  assert.equal(f.step, 0);
});

test('rates on the proposed side with no customers is caught before the report reads $0', () => {
  const s = makeSampleStudy();
  const com = s.classes.find(c => c.id === 'com');
  com.prop.customers = '';
  const f = find(validateStudy(s), 'class-prop-customers-com');
  assert.ok(f);
  assert.equal(f.severity, 'error');
  assert.equal(f.step, 1);
});

test('a usage distribution that contradicts the entered totals is flagged', () => {
  const s = makeSampleStudy();
  // The distribution totals 240 customers; claim 400 on the Current tab.
  s.classes.find(c => c.id === 'res').cur.customers = '400';
  const f = find(validateStudy(s), 'dist-cust-mismatch-res');
  assert.ok(f, 'expected the distribution/count mismatch finding');
  assert.equal(f.severity, 'warn');
});

test('a small rounding difference between distribution and totals is not flagged', () => {
  const s = makeSampleStudy();
  s.classes.find(c => c.id === 'res').cur.customers = '242'; // <1% off 240
  assert.ok(!has(validateStudy(s), 'dist-cust-mismatch-res'));
});

test('declining block rates are surfaced as a probable transcription slip', () => {
  const s = makeSampleStudy();
  const res = s.classes.find(c => c.id === 'res');
  res.prop.tiers = [
    { gal: 1000, rate: '8.00' },
    { gal: 2000, rate: '7.00' },
    { gal: 3000, rate: '6.00' },
  ];
  const f = find(validateStudy(s), 'declining-proposed-res');
  assert.ok(f);
  assert.equal(f.severity, 'info');
});

test('a purchased-water system with no purchased-water cost is flagged', () => {
  const s = makeSampleStudy();
  s.systemInfo.sourceType = 'purchased';
  const f = find(validateStudy(s), 'purchased-no-cost');
  assert.ok(f);
  assert.equal(f.severity, 'warn');
  assert.equal(f.step, 2);
});

test('proposed rates that do not cover proposed expenses are blocking', () => {
  const s = makeSampleStudy();
  // Halve every proposed rate and base charge.
  s.classes = s.classes.map(c => (c.enabled
    ? { ...c, prop: { ...c.prop, minCharge: '1', tiers: c.prop.tiers.map(t => ({ ...t, rate: '0.10' })) } }
    : c));
  const f = find(validateStudy(s), 'or-below-1');
  assert.ok(f, 'expected the below-break-even finding');
  assert.equal(f.severity, 'error');
  assert.equal(f.step, 3);
});

test('identity gaps escalate from advisory to blocking once a study is Complete', () => {
  const draft = makeSampleStudy();
  draft.systemInfo.pwsId = '';
  assert.equal(find(validateStudy(draft), 'pws-id').severity, 'warn');

  const complete = makeSampleStudy();
  complete.systemInfo.pwsId = '';
  complete.status = 'complete';
  assert.equal(find(validateStudy(complete), 'pws-id').severity, 'error');
});

test('a malformed PWS ID is noted without blocking', () => {
  const s = makeSampleStudy();
  s.systemInfo.pwsId = '1234567';
  const f = find(validateStudy(s), 'pws-id-format');
  assert.ok(f);
  assert.equal(f.severity, 'info');
});

test('proposed rates identical to current are reported as no change modeled', () => {
  const s = makeSampleStudy();
  const pas = s.classes.find(c => c.id === 'pas');
  pas.prop = { ...pas.cur, tiers: pas.cur.tiers.map(t => ({ ...t })) };
  const f = find(validateStudy(s), 'class-unchanged-pas');
  assert.ok(f);
  assert.equal(f.severity, 'info');
});

test('validateStudy tolerates junk input rather than throwing', () => {
  // The Data Check panel renders on every step change, so a partially-typed or
  // imported study must never take the workspace down with it.
  assert.doesNotThrow(() => validateStudy(undefined));
  assert.doesNotThrow(() => validateStudy({}));
  assert.doesNotThrow(() => validateStudy({ classes: 'not an array', curBudget: 5, forecast: null }));
  assert.doesNotThrow(() => validateStudy(normalizeStudy({ classes: [null, { id: 'x', enabled: true }] })));
});

test('summarizeFindings counts by severity', () => {
  const s = summarizeFindings([
    { severity: 'error' }, { severity: 'error' }, { severity: 'warn' }, { severity: 'info' },
  ]);
  assert.deepEqual(s, { error: 2, warn: 1, info: 1, total: 4, blocking: 2 });
  assert.deepEqual(summarizeFindings([]), { error: 0, warn: 0, info: 0, total: 0, blocking: 0 });
});

test('every finding points at a real step', () => {
  const findings = [...validateStudy(newStudy('Blank')), ...validateStudy(makeSampleStudy())];
  assert.ok(findings.length > 0);
  for (const f of findings) {
    assert.ok(Number.isInteger(f.step) && f.step >= 0 && f.step <= 7, `bad step on ${f.id}`);
    assert.ok(stepName(f.step), `no name for step ${f.step}`);
    assert.ok(f.title && f.detail, `${f.id} needs a title and detail`);
  }
});

test('finding ids are unique within one run', () => {
  const all = ids(validateStudy(newStudy('Blank')));
  assert.equal(new Set(all).size, all.length, 'duplicate finding ids would break React keys');
});
