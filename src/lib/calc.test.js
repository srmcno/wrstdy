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
