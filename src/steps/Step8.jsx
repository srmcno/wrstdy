import { useState } from 'react';
import { defBudget } from '../lib/state.js';
import { SEAL } from '../lib/seal.js';
import { VER } from '../lib/constants.js';
import {
  budgetTotal, totalRevenue, costPer1000, calc5Yr, operatingRatio,
  affordabilityIndex, debtToIncome, debtServiceCoverage, trueCostOfService,
  hasUsageDistribution, nv, fmt
} from '../lib/calc.js';
import { buildReport, safeFileName } from '../lib/exporters/data.js';
import { statusMeta } from '../lib/status.js';
import { pushToast } from '../components/Toasts.jsx';

export function Step8({ study, onField }) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const si = study.systemInfo;
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
  const curDSCR = debtServiceCoverage(study.curBudget || defBudget(), revCur.monthly);
  const propDSCR = debtServiceCoverage(study.propBudget || defBudget(), revProp.monthly);
  const curCP1K = costPer1000(study.curBudget || defBudget(), classes, false);
  const propCP1K = costPer1000(study.propBudget || defBudget(), classes, true);
  const tcsCur = trueCostOfService(study.curBudget || defBudget(), classes, false);
  const tcsProp = trueCostOfService(study.propBudget || defBudget(), classes, true);
  const anyDist = classes.some(c => c.enabled && hasUsageDistribution(c));
  const curDepr = nv((study.curBudget || defBudget()).oth?.depreciation);
  const propDepr = nv((study.propBudget || defBudget()).oth?.depreciation);
  const curLR = nv((study.curBudget || defBudget()).oth?.longRange);
  const propLR = nv((study.propBudget || defBudget()).oth?.longRange);
  const proj = calc5Yr(classes, study.curBudget || defBudget(), study.propBudget || defBudget(), study.forecast || {});
  const expBase = propBT.total * 12;
  const fcInflation = study.forecast?.inflationRate || '3';

  // Affordability status against the corrected USDA RD / EPA conventions:
  // a HIGHER index (more of household income going to water) is what supports
  // USDA RD grant eligibility; a lower index is simply more affordable.
  const aiLabel = (v) => {
    if (v == null) return '';
    if (v < 0.015) return 'Highly affordable — below the 1.5% USDA RD grant threshold';
    if (v < 0.02) return 'Affordable (EPA); ≥ 1.5% supports a USDA RD grant case';
    return 'Affordability concern — strengthens the case for grant assistance';
  };

  const [busy, setBusy] = useState('');
  const [exportErr, setExportErr] = useState('');

  const baseName = safeFileName(study.systemInfo?.systemName || study.name || 'water-rate-study');
  const yearTag = study.systemInfo?.studyYear || new Date().getFullYear();
  const status = statusMeta(study.status);
  const isComplete = study.status === 'complete';

  function setReportStatus(nextStatus) {
    onField('status', nextStatus);
  }

  async function doExport(kind) {
    setExportErr('');
    setBusy(kind);
    let filename = '';
    try {
      const report = buildReport(study);
      if (kind === 'pdf') {
        filename = `${baseName}-${yearTag}-rate-study.pdf`;
        const { exportPDF } = await import('../lib/exporters/pdf.js');
        await exportPDF(report, filename);
      } else if (kind === 'docx') {
        filename = `${baseName}-${yearTag}-rate-study.docx`;
        const { exportDocx } = await import('../lib/exporters/docx.js');
        // Pre-load the seal as bytes (docx ImageRun expects Uint8Array)
        let sealBytes = null;
        try {
          const r = await fetch(SEAL);
          sealBytes = new Uint8Array(await r.arrayBuffer());
        } catch { /* skip seal */ }
        await exportDocx(report, filename, sealBytes);
      }
      pushToast(`Exported ${filename}`, { kind: 'ok' });
    } catch (e) {
      console.error(e);
      const stage = e?.stage ? ` during ${e.stage}` : '';
      const msg = `${kind.toUpperCase()} export failed${stage}: ${e.message || e}`;
      setExportErr(msg);
      pushToast(msg, { kind: 'err', duration: 8000 });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Final Report</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>Board-ready report. Export to PDF for distribution, or to Word (.docx) to edit before submission.</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isComplete ? (
            <button
              className="btn b-out btn-sm"
              onClick={() => setReportStatus('in-progress')}
              title="Reopen this study so dashboard, sidebar, and map status return to In Progress."
            >
              ↩ Reopen
            </button>
          ) : (
            <button
              className="btn b-lime btn-sm"
              onClick={() => setReportStatus('complete')}
              title="Mark this final report complete across dashboard, sidebar, and map status views."
            >
              ✓ Mark Complete
            </button>
          )}
          <button className="btn b-out btn-sm" onClick={() => doExport('docx')} disabled={!!busy}>
            {busy === 'docx' ? 'Building…' : '📝 Export Word'}
          </button>
          <button className="btn b-lime btn-sm" onClick={() => doExport('pdf')} disabled={!!busy}>
            {busy === 'pdf' ? 'Building…' : '📄 Export PDF'}
          </button>
          <button className="btn b-teal btn-sm" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>
      <div className="al al-i no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>
          <strong>Report status:</strong>{' '}
          <span className={'bs ' + status.badgeClass}>{status.label}</span>
          {isComplete
            ? ' This study is marked complete for dashboard, sidebar, and map views.'
            : ' When the final report is ready for distribution, mark it complete here.'}
        </span>
        {isComplete ? (
          <button className="btn b-out btn-sm" onClick={() => setReportStatus('in-progress')}>Mark In Progress</button>
        ) : (
          <button className="btn b-lime btn-sm" onClick={() => setReportStatus('complete')}>Mark Complete</button>
        )}
      </div>
      {exportErr && <div className="al al-e no-print">{exportErr}</div>}
      <div className="print-only" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #1E3D3B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <img src={SEAL} alt="Seal" style={{ width: 52, height: 52 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>CNO Water Rate Study — Report</div>
            <div style={{ fontSize: 12, marginTop: 2, color: '#475569' }}>
              {si.systemName || '[System Name]'}
              {si.pwsId ? ` · PWS ${si.pwsId}` : ''}
              {si.county ? ` · ${si.county} County, OK` : ''}
            </div>
            <div style={{ fontSize: 11, marginTop: 2, color: '#94a3b8' }}>
              Prepared {new Date().toLocaleDateString()}
              {si.studyYear ? ` · Study Year ${si.studyYear}` : ''}
            </div>
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
            <div style={{ fontSize: 22, color: 'var(--teal)' }}>{fmt.cd(curCP1K, 'N/A')}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>per 1,000 Gallons</div>
          </div>
          <div style={{ padding: 14, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Proposed Cost</div>
            <div style={{ fontSize: 22, color: 'var(--lime-dim)' }}>{fmt.cd(propCP1K, 'N/A')}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>per 1,000 Gallons</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ borderLeft: '4px solid var(--teal)' }}>
        <div className="sh">True Cost of Service</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          The table below compares what 1,000 gallons costs the system to produce and deliver against what
          1,000 gallons earns in rate revenue. When cost exceeds revenue, rates are subsidized by reserves —
          the "adjustment to break even" row shows the across-the-board rate change needed to close that gap.
        </p>
        <table className="dt">
          <thead>
            <tr><th></th><th style={{ textAlign: 'right' }}>Current Rates</th><th style={{ textAlign: 'right' }}>Proposed Rates</th></tr>
          </thead>
          <tbody>
            <tr><td>Annual operating expenses</td><td style={{ textAlign: 'right' }}>{fmt.c(tcsCur.annualExpenses)}</td><td style={{ textAlign: 'right' }}>{fmt.c(tcsProp.annualExpenses)}</td></tr>
            <tr><td>Annual gallons sold</td><td style={{ textAlign: 'right' }}>{fmt.n(tcsCur.annualGallons)}</td><td style={{ textAlign: 'right' }}>{fmt.n(tcsProp.annualGallons)}</td></tr>
            <tr><td>True cost per 1,000 gallons</td><td style={{ textAlign: 'right' }}>{fmt.cd(tcsCur.costPer1k, 'N/A')}</td><td style={{ textAlign: 'right' }}>{fmt.cd(tcsProp.costPer1k, 'N/A')}</td></tr>
            <tr><td>Average revenue per 1,000 gallons</td><td style={{ textAlign: 'right' }}>{fmt.cd(tcsCur.revenuePer1k, 'N/A')}</td><td style={{ textAlign: 'right' }}>{fmt.cd(tcsProp.revenuePer1k, 'N/A')}</td></tr>
            <tr className="tr-t">
              <td>Adjustment needed to break even</td>
              <td style={{ textAlign: 'right' }}>{tcsCur.breakEvenAdjustment == null ? 'N/A' : (tcsCur.breakEvenAdjustment > 0 ? '+' : '') + (tcsCur.breakEvenAdjustment * 100).toFixed(1) + '%'}</td>
              <td style={{ textAlign: 'right' }}>{tcsProp.breakEvenAdjustment == null ? 'N/A' : (tcsProp.breakEvenAdjustment > 0 ? '+' : '') + (tcsProp.breakEvenAdjustment * 100).toFixed(1) + '%'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="sh">Five Year Outlook</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          Projected revenue, expenses, and fund balance under the proposed rates using the study's forecast
          assumptions ({fcInflation}% inflation), with 3% and 5% inflation shown as sensitivity comparisons.
        </p>
        <table className="dt">
          <thead>
            <tr><th>Scenario</th>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Annual Revenue (Proposed Rates)</td>{proj.propRevArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td>Projected Annual Expenses ({fcInflation}% forecast)</td>{proj.propExpArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td style={{ color: 'var(--dim)' }}>Sensitivity: expenses at 3% inflation</td>{proj.yrs.map((_, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--dim)' }}>{fmt.c(expBase * Math.pow(1.03, i))}</td>)}</tr>
            <tr><td style={{ color: 'var(--dim)' }}>Sensitivity: expenses at 5% inflation</td>{proj.yrs.map((_, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--dim)' }}>{fmt.c(expBase * Math.pow(1.05, i))}</td>)}</tr>
          </tbody>
          <tfoot>
            <tr className="tr-t">
              <td>Fund Balance (Proposed, {fcInflation}% forecast)</td>
              {proj.propFBArr.map((v, i) => (
                <td key={i} style={{ textAlign: 'right', color: v >= nv(study.forecast?.targetFundBalance || 5000) ? '#a8e060' : '#fca5a5' }}>
                  {fmt.c(v)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 8 }}>
          The fund balance row follows the {fcInflation}% forecast expense row above it (plus any scheduled debt
          service and known one-time items from Step 5). The 3% sensitivity represents typical inflation; the 5%
          sensitivity accounts for rising costs in utilities, materials, and labor.
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
            <div style={{ fontSize: 24, color: curOR == null ? 'var(--dim)' : curOR >= 1.25 ? 'var(--lime-dim)' : curOR >= 1 ? 'var(--amber)' : 'var(--red)' }}>{fmt.ratio(curOR, 'N/A')}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
              {curOR == null ? 'Enter budget expenses to calculate' : curOR >= 1.25 ? 'Healthy (≥ 1.25)' : curOR >= 1.0 ? 'At break-even' : 'Below break-even'}
            </div>
          </div>
          <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Proposed Operating Ratio</div>
            <div style={{ fontSize: 24, color: propOR == null ? 'var(--dim)' : propOR >= 1.25 ? 'var(--lime-dim)' : propOR >= 1 ? 'var(--amber)' : 'var(--red)' }}>{fmt.ratio(propOR, 'N/A')}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
              {propOR == null ? 'Enter budget expenses to calculate' : propOR >= 1.25 ? 'Healthy (≥ 1.25)' : propOR >= 1.0 ? 'At break-even' : 'Below break-even'}
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
        {curAI != null && propAI != null ? (
          <div className="g3">
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Monthly MHI</div>
              <div style={{ fontSize: 20, color: 'var(--teal)' }}>{fmt.c(mhi)}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Affordability — Current</div>
              <div style={{ fontSize: 20, color: curAI < 0.02 ? 'var(--lime-dim)' : 'var(--red)' }}>{(curAI * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>{aiLabel(curAI)}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Affordability — Proposed</div>
              <div style={{ fontSize: 20, color: propAI < 0.02 ? 'var(--lime-dim)' : 'var(--red)' }}>{(propAI * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>{aiLabel(propAI)}</div>
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
            <div style={{ fontSize: 22, color: curDTI == null ? 'var(--dim)' : curDTI < 0.45 ? 'var(--lime-dim)' : 'var(--red)' }}>{curDTI == null ? 'N/A' : (curDTI * 100).toFixed(1) + '%'}</div>
          </div>
          <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Proposed DTI</div>
            <div style={{ fontSize: 22, color: propDTI == null ? 'var(--dim)' : propDTI < 0.45 ? 'var(--lime-dim)' : 'var(--red)' }}>{propDTI == null ? 'N/A' : (propDTI * 100).toFixed(1) + '%'}</div>
          </div>
        </div>
      </div>
      {(curDSCR != null || propDSCR != null) && (
        <div className="card">
          <div className="sh">Debt Service Coverage Ratio (DSCR)</div>
          <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
            DSCR measures how comfortably net revenue (after operating expenses) covers debt payments — the metric
            USDA Rural Development and OWRB loan covenants are typically written against. Lenders generally
            require 1.10–1.25 or better.
          </p>
          <div className="g2">
            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Current DSCR</div>
              <div style={{ fontSize: 22, color: curDSCR == null ? 'var(--dim)' : curDSCR >= 1.25 ? 'var(--lime-dim)' : curDSCR >= 1.1 ? 'var(--amber)' : 'var(--red)' }}>{fmt.ratio(curDSCR, 'No debt')}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--lime-pale)', borderRadius: 7, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Proposed DSCR</div>
              <div style={{ fontSize: 22, color: propDSCR == null ? 'var(--dim)' : propDSCR >= 1.25 ? 'var(--lime-dim)' : propDSCR >= 1.1 ? 'var(--amber)' : 'var(--red)' }}>{fmt.ratio(propDSCR, 'No debt')}</div>
            </div>
          </div>
        </div>
      )}
      {study.aiAnalysis?.content && (
        <div className="card">
          <div className="sh">AI-Generated Analysis</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {study.aiAnalysis.content}
          </div>
        </div>
      )}
      <div className="card" style={{ borderLeft: '4px solid var(--amber)' }}>
        <div className="sh">Data Quality & Limitations</div>
        <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
          Results in this study are dependent on the quality, completeness, and accuracy of the data provided by
          the water system. Missing, incomplete, estimated, or manually transcribed billing data — including data
          converted from scanned or photographed reports — may affect the accuracy of the revenue figures and
          projections. All projections should be reviewed with the system's records before being used for final
          rate decisions.
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--mid)', lineHeight: 1.65 }}>
          Revenue basis for this study: {anyDist
            ? 'customer usage distribution (billed bracket-by-bracket against the tier structure).'
            : 'class averages — every customer is assumed to use the class average, which understates revenue for tiered rates. Entering a customer usage distribution in Step 2 improves accuracy.'}
        </p>
      </div>
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
