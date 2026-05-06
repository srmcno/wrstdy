// Builds a normalized "report model" for the study, used by both the PDF
// and DOCX exporters so the two outputs always agree on numbers.

import { defBudget } from '../state.js';
import { scenarioForClasses } from '../scenarios.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome,
  affordabilityIndex, debtToIncome, baseCoverage, operatingRatio,
  costPer1000, cost5000, calc5Yr, nv, fmt
} from '../calc.js';

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
  const target = nv(study.forecast?.targetFundBalance) || 5000;

  const curOR = operatingRatio(revCur.monthly, curBT.total);
  const propOR = operatingRatio(revProp.monthly, propBT.total);
  const curAI = mhi ? affordabilityIndex(classes, false, mhi) : null;
  const propAI = mhi ? affordabilityIndex(classes, true, mhi) : null;
  const curDTI = debtToIncome(curB, revCur.monthly);
  const propDTI = debtToIncome(propB, revProp.monthly);
  const curBC = baseCoverage(classes, false, curBT.total);
  const propBC = baseCoverage(classes, true, propBT.total);

  const scorecard = [
    { metric: 'Operating Ratio', cur: curOR.toFixed(2), prop: propOR.toFixed(2), benchmark: '≥ 1.25',
      curOk: curOR >= 1.25, propOk: propOR >= 1.25 },
    { metric: 'Affordability Index', cur: mhi ? fmt.p(curAI) : 'N/A', prop: mhi ? fmt.p(propAI) : 'N/A', benchmark: '< 2.00%',
      curOk: mhi ? curAI < 0.02 : null, propOk: mhi ? propAI < 0.02 : null },
    { metric: 'Debt-to-Income Ratio', cur: fmt.p(curDTI), prop: fmt.p(propDTI), benchmark: '< 45%',
      curOk: curDTI < 0.45, propOk: propDTI < 0.45 },
    { metric: 'Base-Only Coverage', cur: fmt.p(curBC), prop: fmt.p(propBC), benchmark: '≥ 100%',
      curOk: curBC >= 1.0, propOk: propBC >= 1.0 },
    { metric: 'FY5 Fund Balance vs. Target', cur: fmt.c(proj.curFBArr[4] || 0), prop: fmt.c(proj.propFBArr[4] || 0), benchmark: `≥ ${fmt.c(target)}`,
      curOk: (proj.curFBArr[4] || 0) >= target, propOk: (proj.propFBArr[4] || 0) >= target },
  ];

  const classRows = classes.filter(c => c.enabled).map(c => {
    const ci = classMonthlyIncome(c, false);
    const pi = classMonthlyIncome(c, true);
    const chg = pi.monthly - ci.monthly;
    return {
      name: c.name || c.id,
      customers: nv(c.cur.customers || c.prop.customers),
      cur: ci.monthly,
      prop: pi.monthly,
      delta: chg,
      pct: ci.monthly > 0 ? (chg / ci.monthly) * 100 : 0,
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
  const fiveYearOutlook = proj.yrs.map((yr, i) => ({
    yr,
    revenue: proj.propRevArr[i],
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
    curBT, propBT, revCur, revProp,
    curOR, propOR, curAI, propAI, curDTI, propDTI, curBC, propBC,
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
