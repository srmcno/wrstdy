import { defBudget } from '../lib/state.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome,
  operatingRatio, affordabilityIndex, debtToIncome, baseCoverage,
  calc5Yr, nv, fmt
} from '../lib/calc.js';

function StatusPill({ ok, label }) {
  if (ok === null || ok === undefined) return <span className="sc-pill sc-neu">{label}</span>;
  return <span className={'sc-pill ' + (ok ? 'sc-ok' : 'sc-bad')}>{ok ? '✓' : '✗'} {label}</span>;
}

export function Step4({ study }) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const curBT = budgetTotal(study.curBudget || defBudget());
  const propBT = budgetTotal(study.propBudget || defBudget());
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
  const curOR = operatingRatio(revCur.monthly, curBT.total);
  const propOR = operatingRatio(revProp.monthly, propBT.total);
  const curAI = affordabilityIndex(classes, false, mhi);
  const propAI = affordabilityIndex(classes, true, mhi);
  const curDTI = debtToIncome(study.curBudget || defBudget(), revCur.monthly);
  const propDTI = debtToIncome(study.propBudget || defBudget(), revProp.monthly);
  const curBC = baseCoverage(classes, false, curBT.total);
  const propBC = baseCoverage(classes, true, propBT.total);
  const curDepr = nv((study.curBudget || defBudget()).oth?.depreciation);
  const propDepr = nv((study.propBudget || defBudget()).oth?.depreciation);
  const proj = calc5Yr(classes, study.curBudget || defBudget(), study.propBudget || defBudget(), study.forecast || {});
  const curFY5 = proj.curFBArr[4] || 0;
  const propFY5 = proj.propFBArr[4] || 0;
  const target = nv(study.forecast?.targetFundBalance) || 5000;

  const scorecard = [
    { metric: 'Operating Ratio', cur: curOR.toFixed(2), prop: propOR.toFixed(2), benchmark: '≥ 1.25',
      curOk: curOR >= 1.25, propOk: propOR >= 1.25,
      curStatus: curOR >= 1.25 ? 'Healthy' : 'Below Target', propStatus: propOR >= 1.25 ? 'Healthy' : 'Below Target',
      guide: 'Revenue ÷ Monthly Expenses' },
    { metric: 'Affordability Index', cur: mhi ? fmt.p(curAI) : 'N/A', prop: mhi ? fmt.p(propAI) : 'N/A', benchmark: '< 2.00%',
      curOk: mhi ? curAI < 0.02 : null, propOk: mhi ? propAI < 0.02 : null,
      curStatus: mhi ? (curAI < 0.02 ? 'Affordable' : 'Burden') : 'Enter MHI',
      propStatus: mhi ? (propAI < 0.02 ? 'Affordable' : 'Burden') : 'Enter MHI',
      guide: 'Cost of 5,000 gal ÷ Monthly MHI' },
    { metric: 'Debt-to-Income Ratio', cur: fmt.p(curDTI), prop: fmt.p(propDTI), benchmark: '< 45%',
      curOk: curDTI < 0.45, propOk: propDTI < 0.45,
      curStatus: curDTI < 0.45 ? 'Low' : 'High', propStatus: propDTI < 0.45 ? 'Low' : 'High',
      guide: 'Monthly Debt Payments ÷ Monthly Income' },
    { metric: 'Base-Only Coverage', cur: fmt.p(curBC), prop: fmt.p(propBC), benchmark: '≥ 100%',
      curOk: curBC >= 1.0, propOk: propBC >= 1.0,
      curStatus: curBC >= 1.0 ? 'Covers Expenses' : 'Below Break-even',
      propStatus: propBC >= 1.0 ? 'Covers Expenses' : 'Below Break-even',
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
