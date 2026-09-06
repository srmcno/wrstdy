// Pre-publication data checks for a rate study.
//
// Everything downstream of Step 2 — the scorecard, the projection, the board
// report — is only as good as what was typed in. These checks look for the
// mistakes that actually happen when OWRM staff transcribe a system's billing
// register and budget, and that otherwise surface as a confidently-wrong
// number in a board packet:
//
//   - a proposed side with rates but no customers (proposed revenue reads $0)
//   - an annual MHI pasted into the monthly field (affordability off by 12×)
//   - a usage distribution whose totals contradict the class's own totals
//   - declining block rates entered by accident when tiers were meant to rise
//   - a study marked Complete while a required identifier is still blank
//
// Severity is advisory, never a gate: staff can publish a study with open
// findings (sometimes the data genuinely isn't available), but the findings
// are shown on screen and summarized in the report's data-quality section.

import {
  nv, budgetTotal, totalRevenue, normalizeTiers, hasUsageDistribution,
  classCustomers, classGallons, operatingRatio,
  affordabilityIndex, debtServiceCoverage, monthlyDebtService, calc5Yr,
} from './calc.js';

export const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

const STEP_NAMES = [
  'Step 1 — System Info',
  'Step 2 — Classes & Rates',
  'Step 3 — Budget',
  'Step 4 — Financial Metrics',
  'Step 5 — Projection',
  'Step 6 — Scenarios',
  'Step 7 — AI Analysis',
  'Step 8 — Final Report',
];

export const stepName = (i) => STEP_NAMES[i] || '';

// A relative difference that reads as a transcription error rather than
// rounding — 10% between two figures that should describe the same customers.
const TOLERANCE = 0.1;
const relDiff = (a, b) => {
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base > 0 ? Math.abs(a - b) / base : 0;
};

/**
 * @returns {Array<{id,severity,step,title,detail}>} findings, most severe first
 */
export function validateStudy(study = {}) {
  const out = [];
  const add = (id, severity, step, title, detail) => out.push({ id, severity, step, title, detail });

  const si = study.systemInfo || {};
  const dm = study.demographics || {};
  const classes = Array.isArray(study.classes) ? study.classes : [];
  const enabled = classes.filter(c => c?.enabled);
  const curB = study.curBudget || {};
  const propB = study.propBudget || {};
  const curBT = budgetTotal(curB);
  const propBT = budgetTotal(propB);
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
  const isComplete = study.status === 'complete';
  // Identity fields are advisory while drafting and blocking once the study is
  // being published as a board document.
  const identitySeverity = isComplete ? 'error' : 'warn';

  // ── Step 1: identity and demographics ────────────────────────────────────
  if (!String(si.systemName || '').trim()) {
    add('system-name', identitySeverity, 0, 'System name is blank',
      'The report header, exported file names, and the map all key off the system name.');
  }
  if (!String(si.pwsId || '').trim()) {
    add('pws-id', identitySeverity, 0, 'PWS ID is missing',
      'The PWS ID ties this study to the state SDWIS record. Format: OK0000000.');
  } else if (!/^OK\d{7}$/i.test(String(si.pwsId).trim())) {
    add('pws-id-format', 'info', 0, 'PWS ID does not match the Oklahoma format',
      `"${si.pwsId}" is not in the OK0000000 form. Double-check it against the state record.`);
  }
  if (!String(si.county || '').trim()) {
    add('county', 'warn', 0, 'County is not selected',
      'County drives the dashboard "counties served" count and the district map.');
  }
  if (!(nv(si.populationServed) > 0)) {
    add('population', 'warn', 0, 'Population served is missing',
      'Population is used to sanity-check budget scale and appears in the report header.');
  }

  const mhi = nv(dm.medianMonthlyHHI);
  if (!(mhi > 0)) {
    add('mhi-missing', 'warn', 0, 'Monthly median household income (MHI) not entered',
      'Without MHI the Affordability Index cannot be calculated, and the USDA RD grant-eligibility discussion has no basis.');
  } else if (mhi >= 10000) {
    add('mhi-annual', 'error', 0, 'MHI looks like an annual figure',
      `$${Math.round(mhi).toLocaleString('en-US')}/month is far above any Oklahoma service area. Census ACS publishes ANNUAL MHI — divide by 12. Left as-is, rates look 12× more affordable than they are.`);
  } else if (mhi < 500) {
    add('mhi-low', 'warn', 0, 'MHI looks implausibly low',
      `$${Math.round(mhi).toLocaleString('en-US')}/month would make almost any rate unaffordable. Verify the figure is monthly household income, not per-capita or weekly.`);
  }
  if (!String(dm.effectiveDate || '').trim()) {
    add('effective-date', 'info', 0, 'No effective date for the proposed rates',
      'Boards generally adopt rates effective on a specific date; the report reads "TBD" without one.');
  }

  // ── Step 2: classes and rates ────────────────────────────────────────────
  if (enabled.length === 0) {
    add('no-classes', 'error', 1, 'No customer classes are enabled',
      'Enable at least one class in Step 2 — with none, all revenue is $0 and every ratio is N/A.');
  }

  for (const c of enabled) {
    const label = c.name || c.id;
    const curTiers = normalizeTiers(c.cur?.tiers);
    const propTiers = normalizeTiers(c.prop?.tiers);
    const curHas = nv(c.cur?.minCharge) > 0 || curTiers.some(t => t.rate > 0);
    const propHas = nv(c.prop?.minCharge) > 0 || propTiers.some(t => t.rate > 0);
    const dist = hasUsageDistribution(c);

    if (!curHas && !propHas) {
      add(`class-no-rates-${c.id}`, 'error', 1, `"${label}" is enabled but has no rates`,
        'Neither a base charge nor any tier rate is entered on either side, so this class contributes $0 to revenue.');
    } else if (!propHas) {
      add(`class-no-prop-rates-${c.id}`, 'warn', 1, `"${label}" has no proposed rates`,
        'Proposed revenue for this class reads $0. Use "Cur→Prop" to seed the proposed side from current, then edit.');
    }

    if (!dist) {
      const curCust = nv(c.cur?.customers);
      const propCust = nv(c.prop?.customers);
      if (curCust > 0 && propCust === 0) {
        add(`class-prop-customers-${c.id}`, 'error', 1, `"${label}" has customers on Current but none on Proposed`,
          'Proposed revenue is computed from the proposed side\'s own customer and gallon counts, so it reads $0.00 until those are filled in.');
      }
      if (curCust === 0 && propCust === 0) {
        add(`class-no-customers-${c.id}`, 'warn', 1, `"${label}" has no customer count`,
          'Revenue, base coverage, and the affordability comparison all need a customer count.');
      }
      if (curCust > 0 && !(nv(c.cur?.gallonsSold) > 0)) {
        add(`class-no-gallons-${c.id}`, 'warn', 1, `"${label}" has customers but no gallons sold`,
          'Without monthly gallons the volumetric portion of every bill is zero and cost-per-1,000-gallons cannot be computed.');
      }
    } else {
      // Cross-check the distribution against whatever manual totals were left
      // behind — a mismatch usually means one of the two is stale.
      const distCust = classCustomers(c, false);
      const distGal = classGallons(c, false);
      const manualCust = nv(c.cur?.customers);
      const manualGal = nv(c.cur?.gallonsSold);
      if (manualCust > 0 && relDiff(distCust, manualCust) > TOLERANCE) {
        add(`dist-cust-mismatch-${c.id}`, 'warn', 1, `"${label}" distribution disagrees with the entered customer count`,
          `The usage distribution totals ${distCust.toLocaleString('en-US')} customers, but ${manualCust.toLocaleString('en-US')} was entered on the Current tab. The distribution wins for all calculations — confirm which is right.`);
      }
      if (manualGal > 0 && relDiff(distGal, manualGal) > TOLERANCE) {
        add(`dist-gal-mismatch-${c.id}`, 'warn', 1, `"${label}" distribution disagrees with the entered gallons sold`,
          `The distribution totals ${Math.round(distGal).toLocaleString('en-US')} gal/month against ${Math.round(manualGal).toLocaleString('en-US')} entered. The distribution wins — confirm which matches the billing register.`);
      }
      const emptyRows = (Array.isArray(c.usage) ? c.usage : [])
        .filter(b => nv(b?.customers) > 0 && !(nv(b?.gallons) > 0)).length;
      if (emptyRows > 0) {
        add(`dist-zero-gal-${c.id}`, 'warn', 1, `"${label}" has ${emptyRows} distribution row(s) with customers but 0 gallons`,
          'Those customers are billed the base charge only. If that is not intentional, fill in their monthly gallons.');
      }
    }

    // Declining block rates: legal, but almost always a transcription slip in
    // a small-system study and the opposite of the conservation signal the
    // report describes.
    const declining = (tiers, side) => {
      const rated = tiers.filter(t => t.rate > 0);
      for (let i = 1; i < rated.length; i++) {
        if (rated[i].rate < rated[i - 1].rate) {
          add(`declining-${side}-${c.id}`, 'info', 1, `"${label}" ${side} rates decline between blocks`,
            `The rate drops from $${rated[i - 1].rate.toFixed(2)} to $${rated[i].rate.toFixed(2)} per 1,000 gal at the ${rated[i].gal.toLocaleString('en-US')}-gallon block. Declining blocks reduce the conservation signal — verify this is intended.`);
          return;
        }
      }
    };
    declining(curTiers, 'current');
    declining(propTiers, 'proposed');

    if (propHas && curHas) {
      const same = nv(c.cur?.minCharge) === nv(c.prop?.minCharge)
        && curTiers.length === propTiers.length
        && curTiers.every((t, i) => t.gal === propTiers[i].gal && t.rate === propTiers[i].rate);
      if (same) {
        add(`class-unchanged-${c.id}`, 'info', 1, `"${label}" proposed rates are identical to current`,
          'No rate change is modeled for this class. That is fine if intentional — the report will show a $0 change.');
      }
    }
  }

  // Connections vs. population: rural Oklahoma systems run roughly 2–4 people
  // per connection. Well outside that usually means one figure is wrong.
  const totalCust = enabled.reduce((s, c) => s + (classCustomers(c, false) || classCustomers(c, true)), 0);
  const pop = nv(si.populationServed);
  if (pop > 0 && totalCust > 0) {
    const perConnection = pop / totalCust;
    if (perConnection > 6) {
      add('pop-per-connection-high', 'info', 0, 'Population per connection looks high',
        `${perConnection.toFixed(1)} people per connection (${pop.toLocaleString('en-US')} population ÷ ${totalCust.toLocaleString('en-US')} customers). Typical is 2–4. Check whether some classes or connections are missing.`);
    } else if (perConnection < 1) {
      add('pop-per-connection-low', 'info', 0, 'Population per connection looks low',
        `${perConnection.toFixed(1)} people per connection. Typical is 2–4 — check whether population served is understated.`);
    }
  }

  // ── Step 3: budget ───────────────────────────────────────────────────────
  if (!(propBT.total > 0)) {
    add('no-budget', 'error', 2, 'The proposed budget is empty',
      'Every ratio on the scorecard and the whole 5-year projection are driven by monthly expenses. Enter the proposed budget in Step 3.');
  }
  if (!(curBT.total > 0) && propBT.total > 0) {
    add('no-cur-budget', 'warn', 2, 'The current budget is empty',
      'Current-rate comparisons (operating ratio, true cost of service, the current-track projection) read N/A without it. "Copy Cur→Prop" works in reverse too — fill Current first, then copy.');
  }
  if (propBT.total > 0 && !(nv(propB.oth?.depreciation) > 0)) {
    add('no-depreciation', 'warn', 2, 'No depreciation set-aside in the proposed budget',
      'Without a monthly depreciation line the system is not funding asset replacement — a standard finding in USDA RD and OWRB reviews.');
  }
  if (propBT.total > 0 && !(nv(propB.oth?.insurance) > 0) && !(nv(propB.veh?.insurance) > 0)) {
    add('no-insurance', 'info', 2, 'No insurance expense in the proposed budget',
      'Most systems carry general liability and/or vehicle insurance. Confirm this is genuinely $0 rather than not yet entered.');
  }
  if (propBT.total > 0 && !(nv(propB.ofc?.audit) > 0)) {
    add('no-audit', 'info', 2, 'No audit / accounting expense budgeted',
      'Systems with outstanding debt are typically required to fund an annual audit.');
  }
  if (String(si.sourceType) === 'purchased' && propBT.total > 0 && !(nv(propB.oth?.purchasedWater) > 0)) {
    add('purchased-no-cost', 'warn', 2, 'Source is "Purchased / Wholesale" but purchased water costs $0',
      'A system buying its water should show that cost under Other Expenses → Purchased Water. Leaving it out understates the true cost of service.');
  }

  // ── Step 4: resulting ratios ─────────────────────────────────────────────
  const propOR = operatingRatio(revProp.monthly, propBT.total);
  if (propOR != null && propOR < 1) {
    add('or-below-1', 'error', 3, 'Proposed rates do not cover proposed expenses',
      `Operating ratio is ${propOR.toFixed(2)} (below 1.00). The proposed structure runs a monthly deficit of ${Math.abs(revProp.monthly - propBT.total).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`);
  } else if (propOR != null && propOR < 1.25) {
    add('or-thin', 'warn', 3, 'Proposed operating ratio is below the 1.25 benchmark',
      `Operating ratio is ${propOR.toFixed(2)}. Above break-even, but with no margin for reinvestment or reserves.`);
  }

  const propDSCR = debtServiceCoverage(propB, revProp.monthly);
  if (monthlyDebtService(propB) > 0 && propDSCR != null && propDSCR < 1.15) {
    add('dscr-low', propDSCR < 1 ? 'error' : 'warn', 3, 'Debt service coverage is below typical loan covenants',
      `DSCR is ${propDSCR.toFixed(2)}. USDA RD and OWRB covenants generally require 1.10–1.25. A shortfall here can constitute a covenant violation.`);
  }

  const propAI = affordabilityIndex(classes, true, mhi);
  if (propAI != null && propAI > 0.025) {
    add('affordability-high', 'warn', 3, 'Proposed rates exceed the 2.5% affordability threshold',
      `The 5,000-gallon bill is ${(propAI * 100).toFixed(2)}% of monthly MHI. This strengthens a USDA RD grant case, but should be discussed openly with the board.`);
  }

  if (revCur.monthly > 0 && revProp.monthly > 0) {
    const pct = (revProp.monthly - revCur.monthly) / revCur.monthly;
    if (pct > 0.5) {
      add('big-increase', 'warn', 1, 'Proposed revenue is more than 50% above current',
        `Total revenue rises ${(pct * 100).toFixed(0)}%. Large single-step increases are hard for boards to adopt — consider modeling a phase-in in Step 6.`);
    }
  }

  // ── Step 5: projection ───────────────────────────────────────────────────
  const fc = study.forecast || {};
  if (propBT.total > 0) {
    const proj = calc5Yr(classes, curB, propB, fc);
    const target = nv(fc.targetFundBalance);
    const fy5 = proj.propFBArr[4] ?? 0;
    if (target > 0 && fy5 < target) {
      add('fb-below-target', 'warn', 4, 'Projected FY5 fund balance is below the target',
        `The proposed track ends year 5 at ${fy5.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} against a ${target.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} target.`);
    }
    if (fy5 < 0) {
      add('fb-negative', 'error', 4, 'Projected fund balance goes negative',
        `The proposed track ends year 5 at ${fy5.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. The system cannot sustain the proposed rates over the forecast period.`);
    }
    if (!(nv(fc.targetFundBalance) > 0)) {
      add('no-target', 'info', 4, 'No target fund balance set',
        'Industry guidance is roughly three months of O&M expenses. Step 5 can suggest a figure.');
    }
  }
  const infRate = nv(fc.inflationRate);
  if (infRate > 15) {
    add('inflation-high', 'info', 4, 'Inflation assumption is unusually high',
      `${infRate}% per year compounds to ${((Math.pow(1 + infRate / 100, 4) - 1) * 100).toFixed(0)}% higher expenses by year 5. Confirm this is intended.`);
  }

  // ── Step 8: publication readiness ────────────────────────────────────────
  if (isComplete && !String(study.aiAnalysis?.content || '').trim() && !String(study.reportNotes || '').trim()) {
    add('no-narrative', 'info', 7, 'The report has no written analysis or notes',
      'The tables carry the numbers, but boards act on the narrative. Add report notes in Step 8 or generate an analysis in Step 7.');
  }

  return out.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (a.step - b.step));
}

export function summarizeFindings(findings = []) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) if (counts[f.severity] != null) counts[f.severity]++;
  return { ...counts, total: findings.length, blocking: counts.error };
}
