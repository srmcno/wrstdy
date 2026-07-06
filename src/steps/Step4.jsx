import { defBudget } from '../lib/state.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome, hasUsageDistribution,
  operatingRatio, affordabilityIndex, debtToIncome, baseCoverage, debtServiceCoverage,
  trueCostOfService, calc5Yr, nv, fmt
} from '../lib/calc.js';

function StatusPill({ ok, label }) {
  if (ok === null || ok === undefined) return <span className="sc-pill sc-neu">{label}</span>;
  return <span className={'sc-pill ' + (ok ? 'sc-ok' : 'sc-bad')}>{ok ? '✓' : '✗'} {label}</span>;
}

// ok flag for a nullable metric: null in → null out (renders neutral).
const okIf = (v, pred) => (v == null ? null : pred(v));

export function Step4({ study }) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const curB = study.curBudget || defBudget();
  const propB = study.propBudget || defBudget();
  const curBT = budgetTotal(curB);
  const propBT = budgetTotal(propB);
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
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
  const curDepr = nv(curB.oth?.depreciation);
  const propDepr = nv(propB.oth?.depreciation);
  const proj = calc5Yr(classes, curB, propB, study.forecast || {});
  const curFY5 = proj.curFBArr[4] || 0;
  const propFY5 = proj.propFBArr[4] || 0;
  const target = nv(study.forecast?.targetFundBalance || 5000);
  const tcsCur = trueCostOfService(curB, classes, false);
  const tcsProp = trueCostOfService(propB, classes, true);
  const anyDist = classes.some(c => c.enabled && hasUsageDistribution(c));

  const scorecard = [
    { metric: 'Operating Ratio', cur: fmt.ratio(curOR), prop: fmt.ratio(propOR), benchmark: '≥ 1.25',
      curOk: okIf(curOR, v => v >= 1.25), propOk: okIf(propOR, v => v >= 1.25),
      curStatus: curOR == null ? 'No data' : curOR >= 1.25 ? 'Healthy' : 'Below Target',
      propStatus: propOR == null ? 'No data' : propOR >= 1.25 ? 'Healthy' : 'Below Target',
      guide: 'Revenue ÷ Total Monthly Expenses (incl. debt & set-asides)' },
    { metric: 'Affordability Index', cur: fmt.pd(curAI, 'N/A'), prop: fmt.pd(propAI, 'N/A'), benchmark: '< 2.00%',
      curOk: okIf(curAI, v => v < 0.02), propOk: okIf(propAI, v => v < 0.02),
      curStatus: curAI == null ? 'Enter MHI' : (curAI < 0.02 ? 'Affordable' : 'Burden'),
      propStatus: propAI == null ? 'Enter MHI' : (propAI < 0.02 ? 'Affordable' : 'Burden'),
      guide: 'Cost of 5,000 gal ÷ Monthly MHI. ≥ 1.5% generally supports USDA RD grant eligibility.' },
    { metric: 'Debt Service Coverage (DSCR)', cur: fmt.ratio(curDSCR, 'No debt'), prop: fmt.ratio(propDSCR, 'No debt'), benchmark: '≥ 1.25',
      curOk: okIf(curDSCR, v => v >= 1.25), propOk: okIf(propDSCR, v => v >= 1.25),
      curStatus: curDSCR == null ? 'No debt' : curDSCR >= 1.25 ? 'Meets covenant' : curDSCR >= 1.1 ? 'Thin margin' : 'Below covenant',
      propStatus: propDSCR == null ? 'No debt' : propDSCR >= 1.25 ? 'Meets covenant' : propDSCR >= 1.1 ? 'Thin margin' : 'Below covenant',
      guide: '(Revenue − O&M expenses) ÷ Debt payments. USDA RD / OWRB loans typically require ≥ 1.10–1.25.' },
    { metric: 'Debt-to-Income Ratio', cur: fmt.pd(curDTI), prop: fmt.pd(propDTI), benchmark: '< 45%',
      curOk: okIf(curDTI, v => v < 0.45), propOk: okIf(propDTI, v => v < 0.45),
      curStatus: curDTI == null ? 'No data' : curDTI < 0.45 ? 'Low' : 'High',
      propStatus: propDTI == null ? 'No data' : propDTI < 0.45 ? 'Low' : 'High',
      guide: 'Monthly Debt Payments ÷ Monthly Revenue' },
    { metric: 'Base-Only Coverage', cur: fmt.pd(curBC), prop: fmt.pd(propBC), benchmark: '≥ 100%',
      curOk: okIf(curBC, v => v >= 1.0), propOk: okIf(propBC, v => v >= 1.0),
      curStatus: curBC == null ? 'No data' : curBC >= 1.0 ? 'Covers Expenses' : 'Below Break-even',
      propStatus: propBC == null ? 'No data' : propBC >= 1.0 ? 'Covers Expenses' : 'Below Break-even',
      guide: 'Base Charges ÷ Total Expenses' },
    { metric: 'Monthly Depreciation Set-Aside', cur: fmt.c(curDepr), prop: fmt.c(propDepr), benchmark: '> $0',
      curOk: curDepr > 0, propOk: propDepr > 0,
      curStatus: curDepr > 0 ? 'Funded' : 'Not Funded', propStatus: propDepr > 0 ? 'Funded' : 'Not Funded',
      guide: 'Depreciation line item in budget' },
    { metric: 'FY5 Fund Balance vs. Target', cur: fmt.c(curFY5), prop: fmt.c(propFY5), benchmark: `≥ ${fmt.c(target)}`,
      curOk: curFY5 >= target, propOk: propFY5 >= target,
      curStatus: curFY5 >= target ? 'On Target' : 'Below Target',
      propStatus: propFY5 >= target ? 'On Target' : 'Below Target',
      guide: 'Projected fund balance at Year 5' }
  ];

  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Financial Health Scorecard</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Key financial ratios and benchmarks — matching the CNO Water Rate Study Dashboard.</p>
      </div>
      {!mhi && (
        <div className="al al-w">
          <strong>Affordability Index unavailable.</strong>{' '}
          Median Monthly Household Income is required to calculate this metric.
          Go to <strong>Step 1 → Demographics & MHI</strong> and enter the
          Census ACS 5-year estimate for the service area.
        </div>
      )}
      {!anyDist && (
        <div className="al al-i" style={{ fontSize: 11.5 }}>
          No customer usage distribution entered (Step 2). Revenue is approximated by billing every customer at the
          class average, which understates revenue for tiered rates — enter a distribution for dependable numbers.
        </div>
      )}
      <div className="card">
        <div className="sh">System Scorecard</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Metric</th>
                <th style={{ textAlign: 'right' }}>Current</th>
                <th style={{ textAlign: 'right' }}>Proposed</th>
                <th>Benchmark</th>
                <th>Current Status</th>
                <th>Proposed Status</th>
                <th>Guidance</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map(r => (
                <tr key={r.metric}>
                  <td style={{ fontWeight: 500 }}>{r.metric}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{r.cur}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{r.prop}</td>
                  <td style={{ fontSize: 11, color: 'var(--mid)' }}>{r.benchmark}</td>
                  <td><StatusPill ok={r.curOk} label={r.curStatus} /></td>
                  <td><StatusPill ok={r.propOk} label={r.propStatus} /></td>
                  <td style={{ fontSize: 10, color: 'var(--dim)' }}>{r.guide}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--teal)' }}>
        <div className="sh">True Cost of Service</div>
        <p style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          What 1,000 gallons actually costs the system to produce and deliver, versus what 1,000 gallons earns
          under each rate structure — the clearest number for a board conversation about whether rates cover costs.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                <th></th>
                <th style={{ textAlign: 'right' }}>Current</th>
                <th style={{ textAlign: 'right' }}>Proposed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Annual operating expenses (total budget)</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(tcsCur.annualExpenses)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(tcsProp.annualExpenses)}</td>
              </tr>
              <tr>
                <td>Annual gallons sold</td>
                <td style={{ textAlign: 'right' }}>{fmt.n(tcsCur.annualGallons)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.n(tcsProp.annualGallons)}</td>
              </tr>
              <tr className="tr-s">
                <td><strong>True cost per 1,000 gallons</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.cd(tcsCur.costPer1k)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.cd(tcsProp.costPer1k)}</td>
              </tr>
              <tr>
                <td>Average revenue per 1,000 gallons</td>
                <td style={{ textAlign: 'right' }}>{fmt.cd(tcsCur.revenuePer1k)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.cd(tcsProp.revenuePer1k)}</td>
              </tr>
              <tr>
                <td>Gap per 1,000 gallons (cost − revenue)</td>
                <td style={{ textAlign: 'right', color: (tcsCur.gapPer1k ?? 0) > 0 ? 'var(--red)' : 'var(--lime-dim)' }}>{fmt.cd(tcsCur.gapPer1k)}</td>
                <td style={{ textAlign: 'right', color: (tcsProp.gapPer1k ?? 0) > 0 ? 'var(--red)' : 'var(--lime-dim)' }}>{fmt.cd(tcsProp.gapPer1k)}</td>
              </tr>
              <tr>
                <td>Annual surplus / (shortfall)</td>
                <td style={{ textAlign: 'right', color: tcsCur.gapAnnual > 0 ? 'var(--red)' : 'var(--lime-dim)' }}>{fmt.c(-tcsCur.gapAnnual)}</td>
                <td style={{ textAlign: 'right', color: tcsProp.gapAnnual > 0 ? 'var(--red)' : 'var(--lime-dim)' }}>{fmt.c(-tcsProp.gapAnnual)}</td>
              </tr>
              <tr className="tr-t">
                <td>Across-the-board adjustment needed to break even</td>
                <td style={{ textAlign: 'right' }}>{tcsCur.breakEvenAdjustment == null ? '—' : (tcsCur.breakEvenAdjustment > 0 ? '+' : '') + (tcsCur.breakEvenAdjustment * 100).toFixed(1) + '%'}</td>
                <td style={{ textAlign: 'right' }}>{tcsProp.breakEvenAdjustment == null ? '—' : (tcsProp.breakEvenAdjustment > 0 ? '+' : '') + (tcsProp.breakEvenAdjustment * 100).toFixed(1) + '%'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 8 }}>
          Gallons are billed volume; water produced but lost to leaks is not reflected, so the true cost per 1,000 gallons produced may be higher.
        </div>
      </div>

      <div className="card">
        <div className="sh">Monthly Revenue by Customer Class</div>
        <table className="dt">
          <thead>
            <tr>
              <th>Class</th>
              <th style={{ textAlign: 'right' }}>Current ($)</th>
              <th style={{ textAlign: 'right' }}>Proposed ($)</th>
              <th style={{ textAlign: 'right' }}>$ Change</th>
              <th style={{ textAlign: 'right' }}>% Change</th>
            </tr>
          </thead>
          <tbody>
            {classes.filter(c => c.enabled).map(c => {
              const ci = classMonthlyIncome(c, false);
              const pi = classMonthlyIncome(c, true);
              const chg = pi.monthly - ci.monthly;
              return (
                <tr key={c.id}>
                  <td>{c.name || c.id}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(ci.monthly)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(pi.monthly)}</td>
                  <td style={{ textAlign: 'right', color: chg >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
                    {chg >= 0 ? '+' : ''}{fmt.c(chg)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{ci.monthly > 0 ? (chg / ci.monthly * 100).toFixed(1) + '%' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="tr-t">
              <td>Total</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(revCur.monthly)}</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(revProp.monthly)}</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(revProp.monthly - revCur.monthly)}</td>
              <td style={{ textAlign: 'right' }}>
                {revCur.monthly > 0 ? ((revProp.monthly - revCur.monthly) / revCur.monthly * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="g2">
        <div className="card">
          <div className="sh">Revenue Mix — Fixed vs. Volumetric</div>
          <table className="dt">
            <thead>
              <tr>
                <th></th>
                <th style={{ textAlign: 'right' }}>Current (Ann.)</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Proposed (Ann.)</th>
                <th style={{ textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fixed Revenue</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revCur.fixed * 12)}</td>
                <td style={{ textAlign: 'right' }}>{revCur.annual > 0 ? (revCur.fixed * 12 / revCur.annual * 100).toFixed(1) + '%' : '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revProp.fixed * 12)}</td>
                <td style={{ textAlign: 'right' }}>{revProp.annual > 0 ? (revProp.fixed * 12 / revProp.annual * 100).toFixed(1) + '%' : '—'}</td>
              </tr>
              <tr>
                <td>Volumetric Revenue</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revCur.volumetric * 12)}</td>
                <td style={{ textAlign: 'right' }}>{revCur.annual > 0 ? (revCur.volumetric * 12 / revCur.annual * 100).toFixed(1) + '%' : '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revProp.volumetric * 12)}</td>
                <td style={{ textAlign: 'right' }}>{revProp.annual > 0 ? (revProp.volumetric * 12 / revProp.annual * 100).toFixed(1) + '%' : '—'}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="tr-t">
                <td>Total Annual</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revCur.annual)}</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{fmt.c(revProp.annual)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="card">
          <div className="sh">Expense Breakdown by Category</div>
          <table className="dt">
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Current (Mo.)</th>
                <th style={{ textAlign: 'right' }}>Proposed (Mo.)</th>
                <th style={{ textAlign: 'right' }}>$ Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Employee', curBT.emp, propBT.emp],
                ['Office', curBT.ofc, propBT.ofc],
                ['Plant', curBT.plt, propBT.plt],
                ['Distribution', curBT.dst, propBT.dst],
                ['Vehicle', curBT.veh, propBT.veh],
                ['Debt / Loans', curBT.loa, propBT.loa],
                ['Other', curBT.oth, propBT.oth]
              ].filter(r => r[1] > 0 || r[2] > 0).map(([l, c, p]) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(c)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(p)}</td>
                  <td style={{ textAlign: 'right', color: p - c >= 0 ? 'var(--red)' : 'var(--lime-dim)' }}>
                    {p - c >= 0 ? '+' : ''}{fmt.c(p - c)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tr-t">
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(curBT.total)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(propBT.total)}</td>
                <td style={{ textAlign: 'right' }}>{fmt.c(propBT.total - curBT.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
