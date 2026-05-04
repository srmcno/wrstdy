import { useState, useRef, useEffect } from 'react';
import { defBudget } from '../lib/state.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome,
  affordabilityIndex, cost5000, calc5Yr, debtToIncome, baseCoverage,
  costPer1000, operatingRatio, nv, fmt
} from '../lib/calc.js';
import { chat, KEY_STORAGE, BUILD_KEY, MODEL_HEAVY as MODEL, safeGet, safeSet } from '../lib/ai.js';

const SYSTEM_PROMPT = `You are a senior financial analyst for the Choctaw Nation Office of Water Resource Management (OWRM). You write rate-study analyses for tribal public water systems whose boards include non-experts.

Your audience: water system board members, tribal council, and small-system operators. Avoid jargon; when you must use a technical term (e.g. "Operating Ratio"), define it in plain English the first time.

Style: clear, specific, board-ready. Cite numbers from the data given. Do not fabricate values. If a number is missing or zero, call it out as a data gap rather than guessing. Use simple Markdown — # for top-level section headers, ## for subsections, **bold** for key figures, hyphenated bullets — but no tables (the report tool builds those separately).

Standards to apply:
- Operating Ratio: ≥ 1.25 healthy, 1.00–1.24 break-even, < 1.00 unsustainable.
- Affordability Index (cost of 5,000 gal ÷ Monthly MHI): < 1.50% USDA RD grant-eligible threshold, < 2.00% EPA affordable, ≥ 2.00% affordability concern.
- Debt-to-Income: < 45% manageable.
- Base-Only Coverage: ≥ 100% means fixed charges alone cover expenses.
- Depreciation set-aside > $0 indicates the system is funding asset replacement.

Respond with these sections by default unless the user asks for something different:
1. **Executive Summary** — 2–3 sentences a board member can read in 30 seconds.
2. **Financial Health Assessment** — operating ratio, affordability, DTI, base coverage, depreciation funding.
3. **Rate Change Justification** — why the proposed rates are reasonable, tied to specific cost drivers.
4. **Affordability Analysis** — interpret the index against USDA / EPA thresholds; note grant eligibility implications.
5. **Risk Flags** — deficit, high burden, unfunded depreciation, fund balance below target, etc.
6. **Recommendations for the Board** — concrete action items, not platitudes.
7. **Suggested Motion Language** — one or two sentences a board member could read aloud to formally adopt the proposed rates.

When the user follows up, treat their message as a refinement request: rewrite, expand, soften, or add a section. Keep prior content unless they tell you to drop it.`;

function buildContext(study) {
  const classes = study.classes || [];
  const mhi = study.demographics?.medianMonthlyHHI;
  const curB = study.curBudget || defBudget();
  const propB = study.propBudget || defBudget();
  const curBT = budgetTotal(curB);
  const propBT = budgetTotal(propB);
  const revCur = totalRevenue(classes, false);
  const revProp = totalRevenue(classes, true);
  const proj = calc5Yr(classes, curB, propB, study.forecast || {});
  const target = nv(study.forecast?.targetFundBalance) || 5000;
  return [
    `STUDY CONTEXT`,
    `System: ${study.systemInfo?.systemName || '[unknown]'} — PWS ID ${study.systemInfo?.pwsId || 'N/A'} — ${study.systemInfo?.county || ''} County, OK — Study Year ${study.systemInfo?.studyYear || ''}`,
    `Population served: ${study.systemInfo?.populationServed || 'unknown'} — Source: ${study.systemInfo?.sourceType || 'unknown'} — System type: ${study.systemInfo?.systemType || 'unknown'}`,
    `Effective date for proposed rates: ${study.demographics?.effectiveDate || 'TBD'}`,
    ``,
    `BUDGET (monthly)`,
    `- Total expenses: Current ${fmt.c(curBT.total)}, Proposed ${fmt.c(propBT.total)}`,
    `- Total revenue:  Current ${fmt.c(revCur.monthly)}, Proposed ${fmt.c(revProp.monthly)}`,
    `- Net surplus/(deficit): Current ${fmt.c(revCur.monthly - curBT.total)}, Proposed ${fmt.c(revProp.monthly - propBT.total)}`,
    `- Monthly depreciation set-aside: Current ${fmt.c(nv(curB.oth?.depreciation))}, Proposed ${fmt.c(nv(propB.oth?.depreciation))}`,
    `- Monthly capital improvement set-aside: Current ${fmt.c(nv(curB.oth?.longRange))}, Proposed ${fmt.c(nv(propB.oth?.longRange))}`,
    ``,
    `RATIOS`,
    `- Operating Ratio: Current ${operatingRatio(revCur.monthly, curBT.total).toFixed(2)}, Proposed ${operatingRatio(revProp.monthly, propBT.total).toFixed(2)} (benchmark ≥ 1.25)`,
    `- Affordability Index: Current ${mhi ? fmt.p(affordabilityIndex(classes, false, mhi)) : 'N/A'}, Proposed ${mhi ? fmt.p(affordabilityIndex(classes, true, mhi)) : 'N/A'} (benchmark < 2.00%)`,
    `- Debt-to-Income: Current ${fmt.p(debtToIncome(curB, revCur.monthly))}, Proposed ${fmt.p(debtToIncome(propB, revProp.monthly))} (benchmark < 45%)`,
    `- Base-Only Coverage: Current ${fmt.p(baseCoverage(classes, false, curBT.total))}, Proposed ${fmt.p(baseCoverage(classes, true, propBT.total))} (benchmark ≥ 100%)`,
    `- Cost per 1,000 gal: Current ${fmt.c(costPer1000(curB, classes, false))}, Proposed ${fmt.c(costPer1000(propB, classes, true))}`,
    `- Bill at 5,000 gal: Current ${fmt.c(cost5000(classes, false))}, Proposed ${fmt.c(cost5000(classes, true))}`,
    `- Monthly Median Household Income (MHI): ${mhi ? fmt.c(mhi) : 'NOT ENTERED — flag as data gap'}`,
    ``,
    `5-YEAR PROJECTION (proposed rates, with ${study.forecast?.inflationRate || 3}% inflation)`,
    proj.yrs.map((yr, i) => `- ${yr}: Revenue ${fmt.c(proj.propRevArr[i])}, Expenses ${fmt.c(proj.expArr[i])}, Fund Balance ${fmt.c(proj.propFBArr[i])}`).join('\n'),
    `Target fund balance: ${fmt.c(target)} (FY5 proposed: ${fmt.c(proj.propFBArr[4] || 0)} — ${(proj.propFBArr[4] || 0) >= target ? 'on target' : 'below target'})`,
    ``,
    `CUSTOMER CLASSES (enabled only)`,
    classes.filter(c => c.enabled).map(c => {
      const ci = classMonthlyIncome(c, false);
      const pi = classMonthlyIncome(c, true);
      return `- ${c.name || c.id}: ${c.cur.customers || c.prop.customers} customers, ${fmt.c(ci.monthly)}/mo current → ${fmt.c(pi.monthly)}/mo proposed (Δ ${fmt.c(pi.monthly - ci.monthly)})`;
    }).join('\n'),
  ].join('\n');
}

// Step 7's call site uses the shared chat() from lib/ai.js with our system prompt.

export function Step7({ study, onField }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(() => safeGet(KEY_STORAGE) || BUILD_KEY);
  const usingBuildKey = !safeGet(KEY_STORAGE) && !!BUILD_KEY;
  const [followUp, setFollowUp] = useState('');
  const scrollRef = useRef(null);

  // The AI conversation history. Each entry: { role: 'user' | 'assistant', content: string }.
  // We store the full history on the study so it persists across sessions.
  // Migration: studies created before chat support only have aiAnalysis.content.
  // Surface that as a synthetic single-turn history so the user can see and follow up on it.
  const rawHistory = study.aiHistory || [];
  const legacy = rawHistory.length === 0 && study.aiAnalysis?.content
    ? [
        { role: 'user', content: '(Original analysis generated before chat history was tracked. Send a follow-up below to refine it.)' },
        { role: 'assistant', content: study.aiAnalysis.content },
      ]
    : null;
  const history = legacy || rawHistory;
  const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
  const lastAnalysis = lastAssistantMsg?.content || '';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, loading]);

  const saveKey = () => {
    safeSet(KEY_STORAGE, apiKey);
    setShowKey(false);
  };

  async function runInitial() {
    if (!apiKey) { setErr('Set your Anthropic API key first (Settings).'); return; }
    setErr('');
    setLoading(true);
    try {
      const ctx = buildContext(study);
      const userMsg = `${ctx}\n\n---\n\nPlease analyze this water rate study and produce the standard board-ready report (Executive Summary → Financial Health → Rate Justification → Affordability → Risk Flags → Recommendations → Suggested Motion Language). Be specific with numbers.`;
      const newHistory = [{ role: 'user', content: userMsg }];
      const reply = await chat({ system: SYSTEM_PROMPT, history: newHistory });
      const finalHistory = [...newHistory, { role: 'assistant', content: reply }];
      onField({
        aiHistory: finalHistory,
        aiAnalysis: { content: reply, generatedAt: new Date().toISOString() },
      });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sendFollowUp() {
    const text = followUp.trim();
    if (!text) return;
    if (!apiKey) { setErr('Set your Anthropic API key first (Settings).'); return; }
    setErr('');
    setLoading(true);
    try {
      const newHistory = [...history, { role: 'user', content: text }];
      const reply = await chat({ system: SYSTEM_PROMPT, history: newHistory });
      const finalHistory = [...newHistory, { role: 'assistant', content: reply }];
      onField({
        aiHistory: finalHistory,
        aiAnalysis: { content: reply, generatedAt: new Date().toISOString() },
      });
      setFollowUp('');
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    if (!window.confirm('Discard the current AI conversation and start over? The latest analysis will also be removed from the report.')) return;
    onField({ aiHistory: [], aiAnalysis: { content: '', generatedAt: '' } });
  }

  // The first user message is huge (full data dump). Hide it from the UI.
  const visibleHistory = history.length > 0 ? history.slice(1) : [];

  const QUICK_PROMPTS = [
    'Rewrite the Executive Summary in simpler language a non-financial board member could understand.',
    'Make the Risk Flags section more direct — list the top 3 risks in priority order.',
    'Add a paragraph explaining what these changes mean for a typical residential customer using 5,000 gallons.',
    'Suggest specific motion wording the board could use to adopt the proposed rates.',
    'What grant programs (USDA RD, OWRB, etc.) might this system qualify for given these metrics?',
  ];

  return (
    <div className="stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>AI Analysis</h2>
          <p style={{ color: 'var(--mid)', fontSize: 12 }}>
            AI-generated, board-ready analysis. Generate once, then ask follow-ups to refine sections, simplify language, add motion text, etc. The latest reply is what appears in the Final Report and the PDF/Word exports.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn b-out btn-sm" onClick={() => setShowKey(s => !s)} title="API key settings">⚙ Settings</button>
          {history.length > 0 && (
            <button className="btn b-out btn-sm" onClick={clearConversation}>Clear</button>
          )}
          {history.length === 0 && (
            <button className="btn b-teal" onClick={runInitial} disabled={loading}>
              {loading ? 'Generating…' : 'Generate Analysis'}
            </button>
          )}
        </div>
      </div>

      {showKey && (
        <div className="card" style={{ background: 'var(--surface)' }}>
          <div className="sh">Anthropic API Key</div>
          <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
            {usingBuildKey
              ? 'Using the API key baked in at build time (VITE_ANTHROPIC_KEY). Override here for this device only.'
              : "Stored in your browser's localStorage. Required only for the AI analysis feature."}
            {' '}Get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>console.anthropic.com</a>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="inp" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." style={{ flex: 1 }} />
            <button className="btn b-lime btn-sm" onClick={saveKey}>Save</button>
          </div>
        </div>
      )}

      {err && <div className="al al-e">{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div ref={scrollRef} style={{ maxHeight: 480, overflowY: 'auto', padding: 16 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--dim)' }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>🤖</div>
              <div style={{ fontSize: 12 }}>Click "Generate Analysis" to produce a board-ready analysis using the data captured across all steps.</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
                Uses {MODEL}. Requires data in Steps 1–5 for best results.
              </div>
            </div>
          ) : (
            visibleHistory.map((m, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 600, letterSpacing: '.08em',
                  color: m.role === 'user' ? 'var(--teal-mid)' : 'var(--lime-dim)',
                  textTransform: 'uppercase', marginBottom: 4
                }}>
                  {m.role === 'user' ? 'You' : 'Analysis'}
                </div>
                <div style={{
                  background: m.role === 'user' ? 'var(--surface)' : 'var(--lime-pale)',
                  border: `1px solid ${m.role === 'user' ? 'var(--border)' : '#86efac'}`,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', textAlign: 'center', padding: 8 }}>
              Thinking…
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  className="btn b-out btn-xs"
                  onClick={() => setFollowUp(p)}
                  disabled={loading}
                  style={{ fontSize: 10, lineHeight: 1.3, textAlign: 'left', maxWidth: 320, whiteSpace: 'normal' }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                className="txa"
                rows={2}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendFollowUp();
                }}
                placeholder="Ask a follow-up: 'Make the risk section shorter', 'Add a paragraph about USDA grant eligibility', 'Explain affordability in plainer language'…  (Ctrl/Cmd+Enter to send)"
                style={{ flex: 1, fontFamily: 'inherit', fontSize: 12.5 }}
                disabled={loading}
              />
              <button className="btn b-lime" onClick={sendFollowUp} disabled={loading || !followUp.trim()}>
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>

      {lastAnalysis && (
        <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>
          Latest analysis ({study.aiAnalysis?.generatedAt ? fmt.date(study.aiAnalysis.generatedAt) : 'just now'}) is included in the Final Report and exports.
        </div>
      )}
    </div>
  );
}
