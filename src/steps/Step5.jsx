import { defBudget } from '../lib/state.js';
import { calc5Yr, budgetTotal, operatingExpenses, targetFundBalance, forecastInflation, nv, fmt } from '../lib/calc.js';
import { F, $I } from '../components/atoms.jsx';
import { FundChart, RevExpChart } from '../components/Charts.jsx';

export function Step5({ study, onField }) {
  const fc = study.forecast || {};
  const upd = (k, v) => onField('forecast', { ...fc, [k]: v });
  const curB = study.curBudget || defBudget();
  const propB = study.propBudget || defBudget();
  const proj = calc5Yr(study.classes || [], curB, propB, fc);
  const curBT = budgetTotal(curB);
  const propBT = budgetTotal(propB);
  const target = targetFundBalance(fc);

  const debtService = Array.from({ length: 5 }, (_, i) => fc.debtService?.[i] ?? '');
  const updDebt = (i, v) => {
    const ds = [...debtService];
    ds[i] = v;
    upd('debtService', ds);
  };
  const knownItems = Array.isArray(fc.knownItems) && fc.knownItems.length > 0
    ? fc.knownItems
    : [{ label: '', vals: ['', '', '', '', ''] }];
  const updKnown = (idx, patch) => {
    const items = knownItems.map(it => ({ label: it.label ?? '', vals: Array.from({ length: 5 }, (_, i) => it.vals?.[i] ?? '') }));
    items[idx] = { ...items[idx], ...patch };
    upd('knownItems', items);
  };
  const addKnown = () => upd('knownItems', [...knownItems, { label: '', vals: ['', '', '', '', ''] }]);
  const remKnown = (idx) => {
    const items = knownItems.filter((_, i) => i !== idx);
    upd('knownItems', items.length > 0 ? items : [{ label: '', vals: ['', '', '', '', ''] }]);
  };

  // Industry guidance: hold roughly 3 months of O&M as an operating reserve.
  const suggestedTarget = Math.round(operatingExpenses(propBT.total > 0 ? propB : curB) * 3);

  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>5-Year Financial Projection</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Fund balance and revenue/expense projections over 5 years. The current-rates track uses the current budget; the proposed track uses the proposed budget.</p>
      </div>
      <div className="card">
        <div className="sh">Forecast Assumptions</div>
        {/* `?? ''`, never `|| default`: with `||` an empty field re-displayed
            the default on the next render, so clearing "3" put "3" straight
            back and a genuine 0% assumption could not be entered at all.
            normalizeForecast already seeds the defaults on load. */}
        <div className="g4">
          <F label="Inflation Rate (%/yr)" hint="Applied to annual operating expenses">
            <input className="inp" type="number" step="0.1" value={fc.inflationRate ?? ''} onChange={(e) => upd('inflationRate', e.target.value)} placeholder="3" />
          </F>
          <F label="Revenue Growth (%/yr)" hint="Usage/rateable revenue increase">
            <input className="inp" type="number" step="0.1" value={fc.revenueGrowth ?? ''} onChange={(e) => upd('revenueGrowth', e.target.value)} placeholder="0" />
          </F>
          <F label="Account Growth (%/yr)" hint="Customer count growth; multiplied with revenue growth">
            <input className="inp" type="number" step="0.1" value={fc.accountGrowth ?? ''} onChange={(e) => upd('accountGrowth', e.target.value)} placeholder="0" />
          </F>
          <F label="Beginning Fund Balance ($)" hint="Cash on hand at the start of Year 1">
            <$I value={fc.beginFundBalance ?? ''} onChange={(v) => upd('beginFundBalance', v)} />
          </F>
          <F label="Target Fund Balance ($)" hint="Industry guidance: about 3 months of O&M expenses">
            <$I value={fc.targetFundBalance ?? ''} onChange={(v) => upd('targetFundBalance', v)} />
          </F>
          {suggestedTarget > 0 && nv(fc.targetFundBalance) !== suggestedTarget && (
            <div style={{ alignSelf: 'end', paddingBottom: 4 }}>
              <button
                className="btn b-out btn-xs"
                title="Set the target to roughly 3 months of monthly expenses — a common operating-reserve guideline"
                onClick={() => upd('targetFundBalance', String(suggestedTarget))}
              >
                Suggest: {fmt.c(suggestedTarget)} (3 mo O&M)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="sh">Debt Service Schedule (annual $, optional)</div>
        <p style={{ fontSize: 11.5, color: 'var(--mid)', marginBottom: 10 }}>
          Debt payments follow amortization schedules, not inflation. Enter the known annual debt service per year to
          override the budget's monthly loan lines (currently {fmt.c(propBT.loa * 12)}/yr proposed, {fmt.c(curBT.loa * 12)}/yr current).
          Leave a year blank to fall back to the budget amount. A zero means no debt payment that year. With all years blank, budget debt stays fixed.
        </p>
        <table className="dt">
          <thead>
            <tr>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              {debtService.map((v, i) => (
                <td key={i}>
                  <input
                    className="inp"
                    type="number"
                    min="0"
                    step="100"
                    style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right' }}
                    value={v}
                    onChange={(e) => updDebt(i, e.target.value)}
                    placeholder={fmt.n(propBT.loa * 12)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="sh">Known One-Time Items (annual $, optional)</div>
        <p style={{ fontSize: 11.5, color: 'var(--mid)', marginBottom: 10 }}>
          Planned capital events the projection should include — meter replacements, tank rehab, engineering studies.
          Positive values add cost in that year; use <strong>negative</strong> values for grants or other one-time revenue.
          Applied to both the current-rates and proposed-rates tracks.
        </p>
        <table className="dt">
          <thead>
            <tr>
              <th>Item</th>
              {proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {knownItems.map((item, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="inp"
                    type="text"
                    style={{ fontSize: 12, padding: '4px 8px' }}
                    value={item.label ?? ''}
                    onChange={(e) => updKnown(idx, { label: e.target.value })}
                    placeholder="e.g. Meter replacement / USDA grant"
                  />
                </td>
                {Array.from({ length: 5 }, (_, i) => (
                  <td key={i}>
                    <input
                      className="inp"
                      type="number"
                      step="500"
                      style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right' }}
                      value={item.vals?.[i] ?? ''}
                      onChange={(e) => {
                        const vals = Array.from({ length: 5 }, (_, j) => item.vals?.[j] ?? '');
                        vals[i] = e.target.value;
                        updKnown(idx, { vals });
                      }}
                      placeholder="0"
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => remKnown(idx)}
                    title="Remove item"
                    aria-label={`Remove one-time item ${idx + 1}`}
                  >✕</button>
                </td>
              </tr>
            ))}
            {proj.knownArr.some(v => v !== 0) && (
              <tr className="tr-t">
                <td>Net one-time items</td>
                {proj.knownArr.map((v, i) => (
                  <td key={i} style={{ textAlign: 'right', color: v > 0 ? 'var(--red)' : v < 0 ? 'var(--lime-dim)' : 'var(--mid)' }}>{fmt.c(v)}</td>
                ))}
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
        <button className="btn b-out btn-xs" style={{ marginTop: 8 }} onClick={addKnown}>+ Add item</button>
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
            <tr><td>Expenses (Current Budget)</td>{proj.curExpArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td>Expenses (Proposed Budget)</td>{proj.propExpArr.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{fmt.c(v)}</td>)}</tr>
            <tr className="tr-s"><td>Fund Balance (Current)</td>{proj.curFBArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: v >= target ? 'var(--lime-dim)' : 'var(--red)' }}>{fmt.c(v)}</td>)}</tr>
            <tr className="tr-s"><td>Fund Balance (Proposed)</td>{proj.propFBArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: v >= target ? 'var(--lime-dim)' : 'var(--red)' }}>{fmt.c(v)}</td>)}</tr>
            <tr><td style={{ color: 'var(--lime-dim)' }}>Target ({fmt.c(target)})</td>{proj.targetArr.map((v, i) => <td key={i} style={{ textAlign: 'right', color: 'var(--lime-dim)' }}>{fmt.c(v)}</td>)}</tr>
          </tbody>
        </table>
        <div className="al al-i" style={{ marginTop: 12, fontSize: 11 }}>
          The current-rates track pairs current rates with the current budget; the proposed track pairs proposed rates
          with the proposed budget. Operating expenses inflate annually at the forecast inflation rate; scheduled debt
          service and known one-time items are applied in the year entered. Revenue grows by the revenue and account
          growth assumptions, combined multiplicatively.
        </div>
      </div>
      <div className="card">
        <div className="sh">Expense Sensitivity — 3% vs. 5% Inflation</div>
        <p style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          Sensitivity view (proposed budget, with the same debt schedule and one-time items): how annual expenses would escalate at 3% and 5%
          inflation — per the CNO Rate Study Final Report format. The projection above uses your forecast
          inflation rate of {forecastInflation(fc)}%.
        </p>
        <table className="dt">
          <thead>
            <tr><th>Scenario</th>{proj.yrs.map(y => <th key={y} style={{ textAlign: 'right' }}>{y}</th>)}</tr>
          </thead>
          <tbody>
            {[['3% Inflation', 0.03], ['5% Inflation', 0.05]].map(([lbl, rate]) => {
              const sensitivity = calc5Yr(study.classes, curB, propB, { ...fc, inflationRate: rate * 100 });
              return (
                <tr key={lbl}>
                  <td>{lbl}</td>
                  {proj.yrs.map((_, i) => {
                    const v = sensitivity.propExpArr[i];
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
