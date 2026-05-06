import { defBudget } from '../lib/state.js';
import { DEFAULT_SCENARIO_ADJUSTMENTS, scenarioForClasses } from '../lib/scenarios.js';
import { budgetTotal, totalRevenue, classMonthlyIncome, affordabilityIndex, nv, fmt } from '../lib/calc.js';

export function Step6({ study, onField }) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const propBT = budgetTotal(study.propBudget || defBudget());
  const defaultAdjustments = { res: 1, pas: 1, com: 1, who: 1, c5: 1, c6: 1, c7: 1 };
  const [scenario, setScenario] = useState({
    rateBasis: {},
    adjustments: defaultAdjustments
  });
  const useProposedRates = (id) => (scenario.rateBasis[id] || 'proposed') === 'proposed';
  const rateBasisLabel = (id) => useProposedRates(id) ? 'Proposed rates' : 'Current rates';
  const multiplier = (id) => scenario.adjustments[id] || 1;
  const applyScenario = (adjustments, basis = 'proposed') => setScenario({
    rateBasis: classes.reduce((acc, c) => ({ ...acc, [c.id]: basis }), {}),
    adjustments
  });
  const adjust = (id, val) => setScenario(s => ({
    ...s,
    adjustments: { ...s.adjustments, [id]: nv(val) }
  }));
  const scenarioIncome = (c) => classMonthlyIncome(c, useProposedRates(c.id)).monthly * multiplier(c.id);
  const baseMonthly = totalRevenue(classes, true).monthly;
  const propRevAdj = classes.filter(c => c.enabled).reduce((s, c) => s + scenarioIncome(c), 0);
  const net = propRevAdj - propBT.total;
  const presets = [
    { label: 'Shift to Residential', action: () => applyScenario({ res: 1.15, pas: 1, com: 0.95, who: 0.95, c5: 1, c6: 1, c7: 1 }), hint: '+15% res, -5% com/who' },
    { label: 'Shift to Commercial', action: () => applyScenario({ res: 0.95, pas: 1, com: 1.20, who: 1.10, c5: 1, c6: 1, c7: 1 }), hint: '-5% res, +20% com' },
    { label: 'Rate Freeze (Current)', action: () => applyScenario(defaultAdjustments, 'current'), hint: 'Use current rates' },
    { label: 'High Burden', action: () => applyScenario({ res: 1.25, pas: 1.10, com: 1.15, who: 1.10, c5: 1, c6: 1, c7: 1 }), hint: '+25% res, +15% com' },
    { label: 'Reset', action: () => applyScenario(defaultAdjustments), hint: 'Back to proposed' }
  ];
  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>Scenario Modeling</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Adjust burden across customer classes to model alternative rate structures. Multiplier presets apply to proposed monthly income; Rate Freeze uses current-rate income for each enabled class.</p>
      </div>
      <div className="card">
        <div className="sh">Quick Presets</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map(p => (
            <div key={p.label} style={{ textAlign: 'center' }}>
              <button className="btn b-out btn-sm" onClick={() => applyScenario(p.adjustments, p.basis, p.label)}>{p.label}</button>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{p.hint}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="sh">Manual Adjustments — Rate Multiplier per Class</div>
        <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 12 }}>1.00 = active rate basis unchanged. 1.10 = +10% on that basis. 0.90 = -10%. Presets identify whether the scenario uses current or proposed rates.</p>
        <div className="g4">
          {classes.filter(c => c.enabled).map(c => (
            <div key={c.id} className="card" style={{ padding: 10, background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 6, fontWeight: 500 }}>{c.name || c.id}</div>
              <input
                className="inp"
                type="number"
                step="0.01"
                min="0"
                max="3"
                value={multiplier(c.id)}
                onChange={(e) => adjust(c.id, e.target.value)}
              />
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
                {rateBasisLabel(c.id)} · Adj inc: {fmt.c(scenarioIncome(c))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ borderLeft: '3px solid var(--lime)' }}>
        <div className="sh">Rainy Day Fund / Capital Reserve Planning</div>
        <p style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          Model how much of the proposed revenue increase should be directed to a capital reserve / rainy day fund.
        </p>
        <div className="g4">
          <div className="mc"><div className="mv">{fmt.c(propRevAdj)}</div><div className="ml">Adjusted Monthly Revenue</div></div>
          <div className="mc"><div className="mv">{fmt.c(propBT.total)}</div><div className="ml">Monthly Expenses</div></div>
          <div className="mc">
            <div className="mv" style={{ color: net >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
              {net >= 0 ? '+' : ''}{fmt.c(net)}
            </div>
            <div className="ml">Net Surplus / (Deficit)</div>
          </div>
          <div className="mc"><div className="mv">{net > 0 ? fmt.c(net * 12) : '$0.00'}</div><div className="ml">Annual Reserve Capacity</div></div>
        </div>
        {net > 0 && (
          <div className="al al-ok" style={{ marginTop: 12 }}>
            At current scenario, the system can build a <strong>{fmt.c(net * 12)}/year</strong> capital reserve.
            At 5 years, that yields <strong>{fmt.c(net * 12 * 5)}</strong> in the rainy day fund.
            {mhi && ` Proposed rates remain at ${fmt.p(affordabilityIndex(classes, true, mhi))} of MHI (< 2.00% = affordable).`}
          </div>
        )}
      </div>
      <div className="card">
        <div className="sh">Scenario Revenue by Class</div>
        <table className="dt">
          <thead>
            <tr>
              <th>Class</th>
              <th style={{ textAlign: 'right' }}>Proposed (Base)</th>
              <th style={{ textAlign: 'right' }}>Rate Basis</th>
              <th style={{ textAlign: 'right' }}>Multiplier</th>
              <th style={{ textAlign: 'right' }}>Scenario Monthly</th>
              <th style={{ textAlign: 'right' }}>vs. Proposed</th>
            </tr>
          </thead>
          <tbody>
            {classes.filter(c => c.enabled).map(c => {
              const base = classMonthlyIncome(c, true).monthly;
              const scenarioBase = classMonthlyIncome(c, useProposedRates(c.id)).monthly;
              const adj = scenarioBase * multiplier(c.id);
              const chg = adj - base;
              return (
                <tr key={c.id}>
                  <td>{c.name || c.id}</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(base)}</td>
                  <td style={{ textAlign: 'right' }}>{rateBasisLabel(c.id)}</td>
                  <td style={{ textAlign: 'right' }}>{multiplier(c.id).toFixed(2)}x</td>
                  <td style={{ textAlign: 'right' }}>{fmt.c(adj)}</td>
                  <td style={{ textAlign: 'right', color: chg >= 0 ? 'var(--lime-dim)' : 'var(--red)' }}>
                    {chg >= 0 ? '+' : ''}{fmt.c(chg)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="tr-t">
              <td>Total</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(baseMonthly)}</td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{fmt.c(propRevAdj)}</td>
              <td style={{ textAlign: 'right' }}>{fmt.c(propRevAdj - baseMonthly)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
