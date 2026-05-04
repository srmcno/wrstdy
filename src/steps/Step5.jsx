import { defBudget } from '../lib/state.js';
import { calc5Yr, budgetTotal, nv, fmt } from '../lib/calc.js';
import { F, $I } from '../components/atoms.jsx';
import { FundChart, RevExpChart } from '../components/Charts.jsx';

export function Step5({ study, onField }) {
  const fc = study.forecast || {};
  const upd = (k, v) => onField('forecast', { ...fc, [k]: v });
  const proj = calc5Yr(study.classes || [], study.curBudget || defBudget(), study.propBudget || defBudget(), fc);
  const propBT = budgetTotal(study.propBudget || defBudget());
  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>5-Year Financial Projection</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Fund balance and revenue/expense projections over 5 years under current and proposed rates.</p>
      </div>
      <div className="card">
        <div className="sh">Forecast Assumptions</div>
        <div className="g4">
          <F label="Inflation Rate (%/yr)" hint="Applied to annual expenses">
            <input className="inp" type="number" step="0.1" value={fc.inflationRate || '3'} onChange={(e) => upd('inflationRate', e.target.value)} />
          </F>
          <F label="Revenue Growth (%/yr)" hint="Account growth or usage increase">
            <input className="inp" type="number" step="0.1" value={fc.revenueGrowth || '0'} onChange={(e) => upd('revenueGrowth', e.target.value)} />
          </F>
          <F label="Beginning Fund Balance ($)">
            <$I value={fc.beginFundBalance || '0'} onChange={(v) => upd('beginFundBalance', v)} />
          </F>
          <F label="Target Fund Balance ($)">
            <$I value={fc.targetFundBalance || '5000'} onChange={(v) => upd('targetFundBalance', v)} />
          </F>
        </div>
      </div>
      <div className="card"><div className="sh">Fund Balance Projection</div><FundChart proj={proj} /></div>
      <div className="card"><div className="sh">Revenue vs. Expenses</div><RevExpChart proj={proj} /></div>
      <div className="card">
        <div className="sh">Year-by-Year Summary</div>
        <table className="dt">
          <thead>
            <tr><th></th>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Revenue (Current Rates)</td>{proj.curRevArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td>Revenue (Proposed Rates)</td>{proj.propRevArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td>Annual Expenses</td>{proj.expArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr className="tr-s"><td>Fund Balance (Current)</td>{proj.curFBArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: v >= nv(fc.targetFundBalance || 5000) ? 'var(--lime-dim)' : 'var(--red)' }}>{fmt.c(v)}</td>)}</tr>
            <tr className="tr-s"><td>Fund Balance (Proposed)</td>{proj.propFBArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: v >= nv(fc.targetFundBalance || 5000) ? 'var(--lime-dim)' : 'var(--red)' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td style={{ color: 'var(--lime-dim)' }}>Target ({fmt.c(fc.targetFundBalance || 5000)})</td>{proj.targetArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--lime-dim)' }}>{fmt.c(v)}</td>)}</tr>
          </tbody>
        </table>
        <div className="al al-i" style={{ marginTop: 12, fontSize: 11 }}>
          3% inflation applied to expenses year-over-year. Revenue held constant at Year 1 rates unless growth rate entered above. Adjust forecast assumptions to model different scenarios.
        </div>
      </div>
      <div className="card">
        <div className="sh">5-Year Rate Escalation Outlook</div>
        <p style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          Projected annual expense increases at 3% and 5% inflation scenarios — per the CNO Rate Study Final Report format.
        </p>
        <table className="dt">
          <thead>
            <tr><th>Scenario</th>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            {[['3% Inflation', 0.03], ['5% Inflation', 0.05]].map(([lbl, rate]) => {
              const base = propBT.total * 12;
              return (
                <tr key={lbl}>
                  <td>{lbl}</td>
                  {proj.yrs.map((_, i) => {
                    const v = base * Math.pow(1 + rate, i);
                    return <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
          The 3% scenario represents a conservative adjustment aligning with typical inflation. The 5% scenario accounts for rising costs in utilities, materials, and labor.
        </div>
      </div>
    </div>
  );
}
