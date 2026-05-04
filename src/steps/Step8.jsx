import { defBudget } from '../lib/state.js';
import { SEAL } from '../lib/seal.js';
import { VER } from '../lib/constants.js';
import {
  budgetTotal, totalRevenue, costPer1000, calc5Yr,
  affordabilityIndex, debtToIncome, nv, fmt
} from '../lib/calc.js';

export function Step8({ study, onField }) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const si = study.systemInfo;
  const curBT = budgetTotal(study.curBudget || defBudget());
  const propBT = budgetTotal(study.propBudget || defBudget());
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
  const curOR = curBT.total > 0 ? revCur.monthly / curBT.total : 0;
  const propOR = propBT.total > 0 ? revProp.monthly / propBT.total : 0;
  const curAI = mhi ? affordabilityIndex(classes, false, mhi) : null;
  const propAI = mhi ? affordabilityIndex(classes, true, mhi) : null;
  const curDTI = debtToIncome(study.curBudget || defBudget(), revCur.monthly);
  const propDTI = debtToIncome(study.propBudget || defBudget(), revProp.monthly);
  const curCP1K = costPer1000(study.curBudget || defBudget(), classes, false);
  const propCP1K = costPer1000(study.propBudget || defBudget(), classes, true);
  const curDepr = nv((study.curBudget || defBudget()).oth?.depreciation);
  const propDepr = nv((study.propBudget || defBudget()).oth?.depreciation);
  const curLR = nv((study.curBudget || defBudget()).oth?.longRange);
  const propLR = nv((study.propBudget || defBudget()).oth?.longRange);
  const proj = calc5Yr(classes, study.curBudget || defBudget(), study.propBudget || defBudget(), study.forecast || {});
  const expBase = propBT.total * 12;

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Final Report</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>Board-ready report matching the CNO Water Rate Study — Final Report format. Print for submission.</p>
        </div>
        <button className="btn b-teal no-print" onClick={() => window.print()}>🖨 Print Report</button>
      </div>
      <div className="print-only" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #1E3D3B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <img src={SEAL} alt="Seal" style={{ width: 52, height: 52 }} />
          <div>
            <div style={{ fontSize: 15 }}>CNO Water Rate Study — Report</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ borderLeft: '4px solid var(--teal)' }}>
        <div style={{ fontSize: 17, color: 'var(--teal)', marginBottom: 6 }}>CNO Water Rate Study — Report</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 4 }}>{fmt.date(new Date().toISOString())}</div>
        <div style={{ fontSize: 13, marginBottom: 2 }}><strong>To:</strong> {si.systemName || '[System Name]'}</div>
        <div style={{ fontSize: 12, color: 'var(--mid)' }}>Board of Directors or Council Members</div>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)' }}>
          The Choctaw Nation's Water Resource Management Office has carefully prepared this rate analysis to ensure your water system remains financially sustainable, operationally sound, and compliant with applicable standards.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)', marginTop: 10 }}>
          This report evaluates your system's income strictly generated from water/wastewater rates — not grants, loans, or one-time revenues — to ensure long-term financial health based on operational income alone.
        </p>
      </div>
      <div className="card">
        <div className="sh">Factors Considered in the Rate Analysis</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--mid)', marginBottom: 10 }}>
          When conducting this rate analysis, several key financial and operational indicators were evaluated:
        </p>
        {[
          { title: 'Cost to Produce and Deliver Water', desc: 'The real cost of providing water and/or wastewater services, including administration, operations, and maintenance.' },
          { title: 'Current and Future Needs of the System', desc: 'Ongoing and upcoming infrastructure, equipment, and maintenance requirements.' },
          { title: 'Operating Ratio', desc: "A measure of the facility's financial health, comparing revenues to expenses." },
          { title: 'Affordability Index', desc: 'A benchmark to determine whether rates remain affordable for the average household in the service area.' },
          { title: 'Debt to Income Ratio', desc: "A measure of the system's ability to manage debt obligations responsibly." }
        ].map(({ title, desc }) => (
          <div key={title} style={{ marginBottom: 10, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.6 }}>{desc}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="sh">Cost to Produce and Deliver Water and/or Wastewater Services</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          Providing safe, reliable drinking water and/or wastewater services requires consistent investment in operations, infrastructure, and personnel.
        </p>
        <div className="g2">
          <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Current Cost</div>
            <div style={{ fontSize: 22, color: 'var(--teal)' }}>{fmt.c(curCP1K)}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>per 1,000 Gallons</div>
          </div>
          <div style={{ padding: 14, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Proposed Cost</div>
            <div style={{ fontSize: 22, color: 'var(--lime-dim)' }}>{fmt.c(propCP1K)}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>per 1,000 Gallons</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="sh">Five Year Outlook</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          To help your operators, board, and stakeholders anticipate how future inflation may affect system costs, the following table projects annual expense requirements over five years at 3% and 5% inflation scenarios.
        </p>
        <table className="dt">
          <thead>
            <tr><th>Scenario</th>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Annual Revenue (Proposed Rates)</td>{proj.propRevArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td>Annual Expenses (3% inflation)</td>{proj.yrs.map((_, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(expBase * Math.pow(1.03, i))}</td>)}</tr>
            <tr><td>Annual Expenses (5% inflation)</td>{proj.yrs.map((_, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(expBase * Math.pow(1.05, i))}</td>)}</tr>
          </tbody>
          <tfoot>
            <tr className="tr-t">
              <td>Fund Balance (Proposed)</td>
              {proj.propFBArr.map((v, i) => (
                <td key={i} style={{ textAlign: 'right', color: v >= nv(study.forecast?.targetFundBalance || 5000) ? '#a8e060' : '#fca5a5' }}>
                  {fmt.c(v)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 8 }}>
          The 3% scenario represents a conservative adjustment aligning with typical inflation. The 5% scenario accounts for rising costs in utilities, materials, and labor, and is recommended for planning purposes.
        </div>
      </div>
      <div className="card">
        <div className="sh">Depreciation and Capital Improvements</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          Depreciation is an accounting method that spreads the cost of a tangible asset — such as pumps, storage tanks, or distribution infrastructure — over its useful life. Consistent funding of depreciation is essential for long-term system sustainability.
        </p>
        <table className="dt">
          <thead>
            <tr><th>Item</th><th style={{ textAlign: 'right' }}>Current Rates</th><th style={{ textAlign: 'right' }}>Proposed Rates</th></tr>
          </thead>
          <tbody>
            <tr><td>Monthly depreciation set aside each month</td><td style={{ textAlign: 'right' }}>{fmt.c(curDepr)}</td><td style={{ textAlign: 'right' }}>{fmt.c(propDepr)}</td></tr>
            <tr><td>Monthly capital improvement set aside</td><td style={{ textAlign: 'right' }}>{fmt.c(curLR)}</td><td style={{ textAlign: 'right' }}>{fmt.c(propLR)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="sh">Operating Ratio</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 8 }}>
          The Operating Ratio is a key measure of financial stability. It compares total operational revenues to operational expenses:
        </p>
        <ul style={{ fontSize: 12, color: 'var(--mid)', paddingLeft: 20, marginBottom: 12, lineHeight: 1.8 }}>
          <li>A ratio of 1.0 means the system breaks even</li>
          <li>A ratio of 1.25 or higher indicates a healthy margin for reinvestment and reserves</li>
          <li>A ratio under 1.0 indicates the system should either increase rates or reduce costs to remain solvent</li>
        </ul>
        <div className="g2">
          <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Current Operating Ratio</div>
            <div style={{ fontSize: 24, color: curOR >= 1.25 ? 'var(--lime-dim)' : curOR >= 1 ? 'var(--amber)' : 'var(--red)' }}>{curOR.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
              {curOR >= 1.25 ? 'Healthy (≥ 1.25)' : curOR >= 1.0 ? 'At break-even' : 'Below break-even'}
            </div>
          </div>
          <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Proposed Operating Ratio</div>
            <div style={{ fontSize: 24, color: propOR >= 1.25 ? 'var(--lime-dim)' : propOR >= 1 ? 'var(--amber)' : 'var(--red)' }}>{propOR.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
              {propOR >= 1.25 ? 'Healthy (≥ 1.25)' : propOR >= 1.0 ? 'At break-even' : 'Below break-even'}
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="sh">Affordability Index</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 8 }}>
          The Affordability Index measures how much of the average household's income is spent on water/wastewater services. It is calculated as: Cost of 5,000 Gallons ÷ Median Monthly Household Income.
        </p>
        <p style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          USDA Rural Development indicates that utilities are grant eligible if the Affordability Index exceeds 1.50%. An index below 2.00% is considered affordable by EPA standards.
        </p>
        {mhi ? (
          <div className="g3">
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Monthly MHI</div>
              <div style={{ fontSize: 20, color: 'var(--teal)' }}>{fmt.c(mhi)}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Affordability — Current</div>
              <div style={{ fontSize: 20, color: curAI < 0.02 ? 'var(--lime-dim)' : 'var(--red)' }}>{(curAI * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>
                {curAI < 0.015 ? 'Below 1.5% — USDA RD eligible' : curAI < 0.02 ? 'Affordable' : 'Affordability concern'}
              </div>
            </div>
            <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Affordability — Proposed</div>
              <div style={{ fontSize: 20, color: propAI < 0.02 ? 'var(--lime-dim)' : 'var(--red)' }}>{(propAI * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>
                {propAI < 0.015 ? 'Below 1.5% — USDA RD eligible' : propAI < 0.02 ? 'Affordable' : 'Affordability concern'}
              </div>
            </div>
          </div>
        ) : (
          <div className="al al-w">Enter Median Monthly Household Income in Step 1 to calculate Affordability Index.</div>
        )}
      </div>
      <div className="card">
        <div className="sh">Debt to Income Ratio</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          The Debt-to-Income Ratio shows the percentage of income used for debt payments. A ratio under 45% is generally considered manageable.
        </p>
        <div className="g2">
          <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Current DTI</div>
            <div style={{ fontSize: 22, color: curDTI < 0.45 ? 'var(--lime-dim)' : 'var(--red)' }}>{(curDTI * 100).toFixed(1)}%</div>
          </div>
          <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Proposed DTI</div>
            <div style={{ fontSize: 22, color: propDTI < 0.45 ? 'var(--lime-dim)' : 'var(--red)' }}>{(propDTI * 100).toFixed(1)}%</div>
          </div>
        </div>
      </div>
      {study.aiAnalysis?.content && (
        <div className="card">
          <div className="sh">AI-Generated Analysis</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {study.aiAnalysis.content}
          </div>
        </div>
      )}
      <div className="card" style={{ borderLeft: '4px solid var(--lime)' }}>
        <div className="sh">Final Recommendations</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)', marginBottom: 10 }}>
          The Choctaw Nation recommends that each system conduct a rate analysis and adjust rates as needed to ensure financial sustainability, proper infrastructure funding, and continued service to tribal members.
        </p>
        <p style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.7 }}>
          Note: This analysis serves as a guidance and reference tool only. The Choctaw Nation is not responsible for any decisions made based on this analysis. Each system's board or council retains final authority over rate setting.
        </p>
      </div>
      <div className="card">
        <div className="sh">Report Notes & Additional Observations</div>
        <textarea
          className="txa"
          rows={4}
          value={study.reportNotes || ''}
          onChange={(e) => onField('reportNotes', e.target.value)}
          placeholder="Additional notes, qualifications, next steps, or recommendations for the board..."
        />
      </div>
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--dim)', fontSize: 11, borderTop: '1px solid var(--border)' }}>
        Choctaw Nation of Oklahoma — Office of Water Resource Management | Water Rate Study Tool v{VER}
        <br />
        Internal tool for OWRM staff use. Rate studies are advisory documents to assist tribal public water systems.
      </div>
    </div>
  );
}
