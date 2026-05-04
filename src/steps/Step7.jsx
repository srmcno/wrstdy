import { useState } from 'react';
import { defBudget } from '../lib/state.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome,
  affordabilityIndex, cost5000, calc5Yr, nv, fmt
} from '../lib/calc.js';

const KEY_STORAGE = 'wrs-anthropic-key';
const BUILD_KEY = import.meta.env.VITE_ANTHROPIC_KEY || '';

export function Step7({ study, onField }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || BUILD_KEY);
  const usingBuildKey = !localStorage.getItem(KEY_STORAGE) && !!BUILD_KEY;
  const ai = study.aiAnalysis || {};

  const saveKey = () => {
    localStorage.setItem(KEY_STORAGE, apiKey);
    setShowKey(false);
  };

  async function generate() {
    if (!apiKey) {
      setErr('Set your Anthropic API key first (gear icon).');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const classes = study.classes || [];
      const mhi = study.demographics?.medianMonthlyHHI;
      const curBT = budgetTotal(study.curBudget || defBudget());
      const propBT = budgetTotal(study.propBudget || defBudget());
      const revCur = totalRevenue(classes, false);
      const revProp = totalRevenue(classes, true);
      const curOR = (curBT.total > 0 ? revCur.monthly / curBT.total : 0).toFixed(2);
      const propOR = (propBT.total > 0 ? revProp.monthly / propBT.total : 0).toFixed(2);
      const curAI = mhi ? (affordabilityIndex(classes, false, mhi) * 100).toFixed(2) : 'N/A';
      const propAI = mhi ? (affordabilityIndex(classes, true, mhi) * 100).toFixed(2) : 'N/A';
      const c5cur = cost5000(classes, false);
      const c5prop = cost5000(classes, true);
      const proj = calc5Yr(classes, study.curBudget || defBudget(), study.propBudget || defBudget(), study.forecast || {});
      const prompt = `You are a financial analyst for the Choctaw Nation Office of Water Resource Management. Analyze this water rate study and provide a professional, structured analysis.

SYSTEM: ${study.systemInfo.systemName || 'Unknown'}, PWS ID: ${study.systemInfo.pwsId || 'N/A'}, ${study.systemInfo.county || ''} County, ${study.systemInfo.studyYear || ''}.

FINANCIAL METRICS:
- Operating Ratio: Current=${curOR}, Proposed=${propOR} (benchmark ≥ 1.25)
- Affordability Index: Current=${curAI}%, Proposed=${propAI}% (benchmark < 2.00%)
- Cost for 5,000 gal: Current=${fmt.c(c5cur)}, Proposed=${fmt.c(c5prop)}
- Monthly Expenses: Current=${fmt.c(curBT.total)}, Proposed=${fmt.c(propBT.total)}
- Monthly Revenue: Current=${fmt.c(revCur.monthly)}, Proposed=${fmt.c(revProp.monthly)}
- Monthly Net: Current=${fmt.c(revCur.monthly - curBT.total)}, Proposed=${fmt.c(revProp.monthly - propBT.total)}
- Median Monthly HHI: ${mhi ? fmt.c(mhi) : 'Not entered'}
- FY5 Fund Balance (Proposed): ${fmt.c(proj.propFBArr[4] || 0)}
- Target Fund Balance: ${fmt.c(nv(study.forecast?.targetFundBalance) || 5000)}

CUSTOMER CLASSES:
${classes.filter(c => c.enabled).map(c => {
  const ci = classMonthlyIncome(c, false);
  const pi = classMonthlyIncome(c, true);
  return `- ${c.name || c.id}: ${c.cur.customers || c.prop.customers} customers, Current income ${fmt.c(ci.monthly)}/mo, Proposed ${fmt.c(pi.monthly)}/mo`;
}).join('\n')}

Write a professional rate study analysis with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences)
2. FINANCIAL HEALTH ASSESSMENT (discuss Operating Ratio, affordability, debt coverage)
3. RATE CHANGE JUSTIFICATION (explain the need and reasonableness)
4. AFFORDABILITY ANALYSIS (discuss USDA RD and EPA thresholds)
5. RISK FLAGS (list any concerns: deficit, high affordability burden, unfunded depreciation, etc.)
6. RECOMMENDATIONS (specific action items for the board)

Be specific with numbers. Write for a board audience. Use plain language.`;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const text = data.content?.map(b => b.text || '').join('') || 'No response received.';
      onField('aiAnalysis', { content: text, generatedAt: new Date().toISOString() });
    } catch (e) {
      setErr('AI analysis failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>AI Analysis</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>AI-generated analysis of the rate study findings for board reporting.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn b-out btn-sm" onClick={() => setShowKey(s => !s)} title="API key settings">⚙ Settings</button>
          <button className="btn b-teal" onClick={generate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate AI Analysis'}
          </button>
        </div>
      </div>
      {showKey && (
        <div className="card" style={{ background: 'var(--surface)' }}>
          <div className="sh">Anthropic API Key</div>
          <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
            {usingBuildKey
              ? 'Using the API key baked in at build time (VITE_ANTHROPIC_KEY). Override here to use a different key on this device only.'
              : 'Stored in your browser\'s localStorage. Required only for the AI analysis feature.'}
            {' '}Get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>console.anthropic.com</a>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="inp"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1 }}
            />
            <button className="btn b-lime btn-sm" onClick={saveKey}>Save</button>
          </div>
        </div>
      )}
      {err && <div className="al al-e">{err}</div>}
      {ai.generatedAt && <div style={{ fontSize: 10, color: 'var(--dim)' }}>Generated {fmt.date(ai.generatedAt)}</div>}
      <div className="card">
        {ai.content
          ? <div className="ai-out">{ai.content}</div>
          : (
            <div style={{ textAlign: 'center', padding: '28px', color: 'var(--dim)' }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>🤖</div>
              <div style={{ fontSize: 12 }}>Click "Generate AI Analysis" to produce a board-ready analysis of this rate study based on the data entered across all steps.</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>Requires financial data in Steps 2–5 for best results.</div>
            </div>
          )
        }
      </div>
    </div>
  );
}
