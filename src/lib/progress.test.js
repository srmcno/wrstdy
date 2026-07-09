import test from 'node:test';
import assert from 'node:assert/strict';

import { stepCompletion, needsBackupReminder } from './progress.js';
import { normalizeStudy } from './state.js';

test('stepCompletion reports all steps incomplete for a brand-new blank study', () => {
  const study = normalizeStudy({});
  const completion = stepCompletion(study);
  assert.equal(completion.length, 8);
  assert.ok(completion.every(v => v === false));
});

test('stepCompletion marks System Info complete once name + population are entered', () => {
  const study = normalizeStudy({ systemInfo: { systemName: 'Antlers RWD', populationServed: '450' } });
  assert.equal(stepCompletion(study)[0], true);
});

test('stepCompletion marks Classes/Rates and Budget independently, gating Financial Metrics on both', () => {
  const ratesOnly = normalizeStudy({
    classes: [{ id: 'res', enabled: true, prop: { customers: '100', minCharge: '10', tiers: [{ gal: 1000, rate: '4' }] } }],
  });
  const [, hasRates, hasBudget, hasFinancials] = stepCompletion(ratesOnly);
  assert.equal(hasRates, true);
  assert.equal(hasBudget, false);
  assert.equal(hasFinancials, false); // needs both rates AND budget

  const full = normalizeStudy({
    classes: ratesOnly.classes,
    propBudget: { emp: { salaries: '5000' } },
  });
  const completionFull = stepCompletion(full);
  assert.equal(completionFull[2], true); // budget
  assert.equal(completionFull[3], true); // financial metrics
  assert.equal(completionFull[4], true); // 5-yr projection
  assert.equal(completionFull[5], true); // scenarios
});

test('stepCompletion marks AI Analysis and Final Report from their own signals', () => {
  const withAi = normalizeStudy({ aiAnalysis: { content: 'Executive summary...' } });
  assert.equal(stepCompletion(withAi)[6], true);

  const completeStudy = normalizeStudy({ status: 'complete' });
  assert.equal(stepCompletion(completeStudy)[7], true);
});

// ─── Backup reminder ─────────────────────────────────────────────────────────

test('needsBackupReminder is false for a study with no real data yet', () => {
  const study = normalizeStudy({});
  assert.equal(needsBackupReminder(study), false);
});

test('needsBackupReminder is true once data exists but the study has never been exported', () => {
  const study = normalizeStudy({ propBudget: { emp: { salaries: '5000' } } });
  assert.equal(needsBackupReminder(study), true);
});

test('needsBackupReminder is false right after export, even with data present', () => {
  const study = normalizeStudy({
    propBudget: { emp: { salaries: '5000' } },
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastExportedAt: '2026-01-01T00:05:00.000Z',
  });
  assert.equal(needsBackupReminder(study), false);
});

test('needsBackupReminder is false for a stale-but-unedited export (no changes since backup)', () => {
  const study = normalizeStudy({
    propBudget: { emp: { salaries: '5000' } },
    updatedAt: '2020-01-01T00:00:00.000Z',
    lastExportedAt: '2020-01-01T00:05:00.000Z',
  });
  assert.equal(needsBackupReminder(study), false);
});

test('needsBackupReminder is true once edits land more than 7 days after the last export', () => {
  const study = normalizeStudy({
    propBudget: { emp: { salaries: '5000' } },
    lastExportedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z', // edited after export, and export is ancient
  });
  assert.equal(needsBackupReminder(study), true);
});
