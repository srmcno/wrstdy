// Builds a normalized "report model" for the study, used by both the PDF
// and DOCX exporters so the two outputs always agree on numbers.

import { defBudget } from '../state.js';
import { scenarioForClasses } from '../scenarios.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome, classCustomers, hasUsageDistribution,
  affordabilityIndex, debtToIncome, baseCoverage, operatingRatio, debtServiceCoverage,
  costPer1000, cost5000, calc5Yr, trueCostOfService, nv, fmt,
  billImpactExamples, rateStructureComparison,
} from '../calc.js';

// Shared wording for the data-quality / liability statement that appears in
// the on-screen report and every export format.
export const DATA_QUALITY_STATEMENT =
  'Results in this study are dependent on the quality, completeness, and accuracy of the data provided by the ' +
  'water system. Missing, incomplete, estimated, or manually transcribed billing data — including data converted ' +
  'from scanned or photographed reports — may affect the accuracy of revenue figures and projections. All ' +
  'projections should be reviewed against the system’s records before being used for final rate decisions.';

// One sentence describing how revenue was computed, shared by the on-screen
// report and the exports so a partially-entered distribution is never
// presented as fully distribution-based. `where` names the place to enter a
// distribution ("Step 2" on screen, "the tool" in exports).
export function revenueBasisText(basis, where = 'the tool') {
  if (basis === 'all') {
    return 'customer usage distribution — revenue is billed bracket-by-bracket against the tier structure.';
  }
  if (basis === 'mixed') {
    return 'mixed — customer usage distributions were used for the classes where they were entered; ' +
      'class averages were used for the remaining classes, which understates revenue for tiered rates in those classes.';
  }
  return 'class averages — every customer is assumed to use the class average, which understates revenue ' +
    `for tiered rates. Entering a customer usage distribution in ${where} improves accuracy.`;
}

export function buildReport(study) {
  const classes = study.classes || [];
  const mhi = nv(study.demographics?.medianMonthlyHHI);
  const curB = study.curBudget || defBudget();
  const propB = study.propBudget || defBudget();
  const curBT = budgetTotal(curB);
  const propBT = budgetTotal(propB);
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
  const proj = calc5Yr(classes, curB, propB, study.forecast || {});
  const target = nv(study.forecast?.targetFundBalance || 5000);

  const curOR = operatingRatio(revCur.monthly, curBT.total);
  const propOR = operatingRatio(revProp.monthly, propBT.total);
  const curAI = affordabilityIndex(classes, false, mhi);
  const propAI = affordabilityIndex(classes, true, mhi);
  const curDTI = debtToIncome(curB, revCur.monthly);
  const propDTI = debtToIncome(propB, revProp.monthly);
  const curDSCR = debtServiceCoverage(curB, revCur.monthly);
  const propDSCR = debtServiceCoverage(propB, revProp.monthly);
  const curBC = baseCoverage(classes, false, curBT.total);
  const propBC = baseCoverage(classes, true, propBT.total);
  const enabledClasses = classes.filter(c => c.enabled);
  const distCount = enabledClasses.filter(c => hasUsageDistribution(c)).length;
  const anyDist = distCount > 0;
  // 'none' | 'mixed' | 'all' — partial distributions must not be reported as
  // fully distribution-based, or reports overstate the study's dependability.
  const usageDistributionBasis =
    distCount === 0 ? 'none' : distCount === enabledClasses.length ? 'all' : 'mixed';

  const scorecard = [
    { metric: 'Operating Ratio', cur: fmt.ratio(curOR, 'N/A'), prop: fmt.ratio(propOR, 'N/A'), benchmark: '≥ 1.25',
      curOk: curOR == null ? null : curOR >= 1.25, propOk: propOR == null ? null : propOR >= 1.25 },
    { metric: 'Affordability Index', cur: fmt.pd(curAI, 'N/A'), prop: fmt.pd(propAI, 'N/A'), benchmark: '< 2.00%',
      curOk: curAI == null ? null : curAI < 0.02, propOk: propAI == null ? null : propAI < 0.02 },
    { metric: 'Debt Service Coverage (DSCR)', cur: fmt.ratio(curDSCR, 'No debt'), prop: fmt.ratio(propDSCR, 'No debt'), benchmark: '≥ 1.25',
      curOk: curDSCR == null ? null : curDSCR >= 1.25, propOk: propDSCR == null ? null : propDSCR >= 1.25 },
    { metric: 'Debt-to-Income Ratio', cur: fmt.pd(curDTI, 'N/A'), prop: fmt.pd(propDTI, 'N/A'), benchmark: '< 45%',
      curOk: curDTI == null ? null : curDTI < 0.45, propOk: propDTI == null ? null : propDTI < 0.45 },
    { metric: 'Base-Only Coverage', cur: fmt.pd(curBC, 'N/A'), prop: fmt.pd(propBC, 'N/A'), benchmark: '≥ 100%',
      curOk: curBC == null ? null : curBC >= 1.0, propOk: propBC == null ? null : propBC >= 1.0 },
    { metric: 'FY5 Fund Balance vs. Target', cur: fmt.c(proj.curFBArr[4] || 0), prop: fmt.c(proj.propFBArr[4] || 0), benchmark: `≥ ${fmt.c(target)}`,
      curOk: (proj.curFBArr[4] || 0) >= target, propOk: (proj.propFBArr[4] || 0) >= target },
  ];

  const classRows = classes.filter(c => c.enabled).map(c => {
    const ci = classMonthlyIncome(c, false);
    const pi = classMonthlyIncome(c, true);
    const chg = pi.monthly - ci.monthly;
    return {
      name: c.name || c.id,
      customers: classCustomers(c, false) || classCustomers(c, true),
      usesDistribution: hasUsageDistribution(c),
      cur: ci.monthly,
      prop: pi.monthly,
      delta: chg,
      // null (renders "—") when current revenue is zero — "+$2,000 (0.0%)"
      // reads as a contradiction in board documents.
      pct: ci.monthly > 0 ? (chg / ci.monthly) * 100 : null,
    };
  });

  const expCats = [
    ['Employee', curBT.emp, propBT.emp],
    ['Office', curBT.ofc, propBT.ofc],
    ['Plant', curBT.plt, propBT.plt],
    ['Distribution', curBT.dst, propBT.dst],
    ['Vehicle', curBT.veh, propBT.veh],
    ['Debt / Loans', curBT.loa, propBT.loa],
    ['Other', curBT.oth, propBT.oth],
  ].filter(r => r[1] > 0 || r[2] > 0).map(([label, cur, prop]) => ({ label, cur, prop, delta: prop - cur }));

  const activeScenario = scenarioForClasses(classes, study.activeScenario || {});
  const scenarioRows = classes.filter(c => c.enabled).map(c => {
    const base = classMonthlyIncome(c, true).monthly;
    const rateBasis = activeScenario.rateBasis[c.id] === 'current' ? 'current' : 'proposed';
    const scenarioBase = classMonthlyIncome(c, rateBasis === 'proposed').monthly;
    const multiplier = activeScenario.adjustments[c.id] ?? 1;
    const monthly = scenarioBase * multiplier;
    return {
      name: c.name || c.id,
      base,
      rateBasis,
      scenarioBase,
      multiplier,
      monthly,
      delta: monthly - base,
    };
  });
  const scenarioMonthlyRevenue = scenarioRows.reduce((sum, row) => sum + row.monthly, 0);
  const scenarioNetMonthly = scenarioMonthlyRevenue - propBT.total;

  const expBaseAnnual = propBT.total * 12;
  const infRaw = study.forecast?.inflationRate;
  const fcInflation = String(infRaw ?? '').trim() === '' ? '3' : String(infRaw);
  const fiveYearOutlook = proj.yrs.map((yr, i) => ({
    yr,
    revenue: proj.propRevArr[i],
    // Projected expenses under the study's forecast assumptions — the row the
    // fund balance actually follows. exp3/exp5 are sensitivity comparisons.
    exp: proj.propExpArr[i],
    exp3: expBaseAnnual * Math.pow(1.03, i),
    exp5: expBaseAnnual * Math.pow(1.05, i),
    fundBalance: proj.propFBArr[i],
  }));

  return {
    generatedAt: new Date().toISOString(),
    system: {
      name: study.systemInfo?.systemName || '',
      pwsId: study.systemInfo?.pwsId || '',
      county: study.systemInfo?.county || '',
      year: study.systemInfo?.studyYear || '',
      population: study.systemInfo?.populationServed || '',
      sourceType: study.systemInfo?.sourceType || '',
      contact: study.systemInfo?.ownerContact || '',
      contactEmail: study.systemInfo?.contactEmail || '',
      contactPhone: study.systemInfo?.contactPhone || '',
      effectiveDate: study.demographics?.effectiveDate || '',
    },
    studyName: study.name,
    mhi,
    target,
    fcInflation,
    curBT, propBT, revCur, revProp,
    curOR, propOR, curAI, propAI, curDTI, propDTI, curBC, propBC,
    curDSCR, propDSCR,
    tcsCur: trueCostOfService(curB, classes, false),
    tcsProp: trueCostOfService(propB, classes, true),
    anyDist,
    usageDistributionBasis,
    dataQualityStatement: DATA_QUALITY_STATEMENT,
    curCP1K: costPer1000(curB, classes, false),
    propCP1K: costPer1000(propB, classes, true),
    cost5kCur: cost5000(classes, false),
    cost5kProp: cost5000(classes, true),
    curDepr: nv(curB.oth?.depreciation),
    propDepr: nv(propB.oth?.depreciation),
    curLR: nv(curB.oth?.longRange),
    propLR: nv(propB.oth?.longRange),
    scorecard,
    classRows,
    billImpact: billImpactExamples(classes),
    rateStructure: rateStructureComparison(classes),
    expCats,
    fiveYearOutlook,
    scenario: {
      label: activeScenario.label,
      adjustments: activeScenario.adjustments,
      rateBasis: activeScenario.rateBasis,
      rows: scenarioRows,
      monthlyRevenue: scenarioMonthlyRevenue,
      monthlyExpenses: propBT.total,
      netMonthly: scenarioNetMonthly,
      annualReserveCapacity: Math.max(0, scenarioNetMonthly * 12),
      vsProposed: scenarioMonthlyRevenue - revProp.monthly,
    },
    proj,
    aiAnalysis: study.aiAnalysis?.content || '',
    aiHistory: study.aiHistory || [],
    reportNotes: study.reportNotes || '',
  };
}

export const safeFileName = (name) =>
  (name || 'water-rate-study').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
