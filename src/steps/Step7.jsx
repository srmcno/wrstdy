import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { defBudget } from '../lib/state.js';
import {
  budgetTotal, totalRevenue, classMonthlyIncome, classCustomers, hasUsageDistribution,
  affordabilityIndex, cost5000, calc5Yr, debtToIncome, baseCoverage, debtServiceCoverage,
  costPer1000, operatingRatio, trueCostOfService, usageBrackets, nv, fmt
} from '../lib/calc.js';
import {
  chat, KEY_STORAGE, BUILD_KEY, AI_PROXY_URL, USE_AI_PROXY, safeGet, safeSet,
  DIRECT_MODELS, fetchAiConfig, getCachedAiConfig,
  getSelectedModel, setSelectedModel, getAccessCode, setAccessCode,
} from '../lib/ai.js';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { startAiJob, isAiBusy, subscribeAiJobs } from '../lib/ai-jobs.js';
import { defer } from '../lib/defer.js';

const SYSTEM_PROMPT = `You are a senior financial analyst for the Choctaw Nation Office of Water Resource Management (OWRM). You write rate-study analyses for tribal public water systems whose boards include non-experts.

Your audience: water system board members, tribal council, and small-system operators. Avoid jargon; when you must use a technical term (e.g. "Operating Ratio"), define it in plain English the first time.

Style: clear, specific, board-ready. Cite numbers from the data given. Do not fabricate values. If a number is missing, zero, or marked N/A, call it out as a data gap rather than guessing. Use simple Markdown — # for top-level section headers, ## for subsections, **bold** for key figures, hyphenated bullets — but no tables (the report tool builds those separately).

Standards to apply:
- Operating Ratio (revenue ÷ total expenses incl. debt & set-asides): ≥ 1.25 healthy, 1.00–1.24 break-even, < 1.00 unsustainable.
- Debt Service Coverage Ratio (net revenue after O&M ÷ annual debt payments): USDA RD / OWRB loan covenants typically require ≥ 1.10–1.25.
- Affordability Index (cost of 5,000 gal ÷ Monthly MHI): < 2.00% is EPA-affordable; an index ABOVE 1.50% generally supports USDA RD grant eligibility (higher burden strengthens the grant case — never describe a LOW index as "grant eligible").
- Debt-to-Income: < 45% manageable.
- Base-Only Coverage: ≥ 100% means fixed charges alone cover expenses.
- Depreciation set-aside > $0 indicates the system is funding asset replacement.
- True Cost of Service: when cost per 1,000 gallons exceeds revenue per 1,000 gallons, rates are subsidized by reserves and the gap should be closed.
- Revenue basis: if the data says revenue is computed from class AVERAGES (no usage distribution), treat revenue as approximate and flag it — average-based revenue understates income under tiered rates and cannot capture high-volume users.

Respond with these sections by default unless the user asks for something different:
1. **Executive Summary** — 2–3 sentences a board member can read in 30 seconds.
2. **Financial Health Assessment** — operating ratio, DSCR, affordability, DTI, base coverage, depreciation funding.
3. **True Cost of Service** — what 1,000 gallons costs vs. earns, and what that means for rates.
4. **Rate Change Justification** — why the proposed rates are reasonable, tied to specific cost drivers.
5. **Affordability Analysis** — interpret the index against USDA / EPA thresholds; note grant-eligibility implications with the correct direction (burden above 1.5% of MHI supports grants).
6. **Risk Flags** — deficit, high burden, unfunded depreciation, fund balance below target, thin DSCR, approximate revenue basis, etc.
7. **Recommendations for the Board** — concrete action items, not platitudes.
8. **Suggested Motion Language** — one or two sentences a board member could read aloud to formally adopt the proposed rates.

End with a one-line data-quality reminder: results depend on the completeness and accuracy of the data provided; projections should be verified against system records before final rate decisions.

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
  const target = nv(study.forecast?.targetFundBalance || 5000);
  const tcsCur = trueCostOfService(curB, classes, false);
  const tcsProp = trueCostOfService(propB, classes, true);
  const enabledClasses = classes.filter(c => c.enabled);
  const distCount = enabledClasses.filter(c => hasUsageDistribution(c)).length;
  const revenueBasis = distCount > 0 && distCount === enabledClasses.length
    ? 'customer usage distribution for all enabled classes (billed bracket-by-bracket — dependable for tier changes)'
    : distCount > 0
      ? `MIXED — ${distCount} of ${enabledClasses.length} enabled classes have usage distributions; the remaining classes use class averages, which are approximate for tiered rates. Flag this as a data gap.`
      : 'CLASS AVERAGES ONLY — no usage distribution entered; revenue is approximate and understates tiered-rate income. Flag this as a data gap.';
  const r2 = (v) => (v == null ? 'N/A' : v.toFixed(2));
  const debtSched = (study.forecast?.debtService || []).map(v => String(v ?? '').trim()).filter(Boolean);
  const knownRows = (study.forecast?.knownItems || []).filter(it => (it?.vals || []).some(v => nv(v) !== 0));
  return [
    `STUDY CONTEXT`,
    `System: ${study.systemInfo?.systemName || '[unknown]'} — PWS ID ${study.systemInfo?.pwsId || 'N/A'} — ${study.systemInfo?.county || ''} County, OK — Study Year ${study.systemInfo?.studyYear || ''}`,
    `Population served: ${study.systemInfo?.populationServed || 'unknown'} — Source: ${study.systemInfo?.sourceType || 'unknown'} — System type: ${study.systemInfo?.systemType || 'unknown'}`,
    `Effective date for proposed rates: ${study.demographics?.effectiveDate || 'TBD'}`,
    `Revenue basis: ${revenueBasis}`,
    ``,
    `BUDGET (monthly)`,
    `- Total expenses: Current ${fmt.c(curBT.total)}, Proposed ${fmt.c(propBT.total)}`,
    `- Total revenue:  Current ${fmt.c(revCur.monthly)}, Proposed ${fmt.c(revProp.monthly)}`,
    `- Net surplus/(deficit): Current ${fmt.c(revCur.monthly - curBT.total)}, Proposed ${fmt.c(revProp.monthly - propBT.total)}`,
    `- Monthly depreciation set-aside: Current ${fmt.c(nv(curB.oth?.depreciation))}, Proposed ${fmt.c(nv(propB.oth?.depreciation))}`,
    `- Monthly capital improvement set-aside: Current ${fmt.c(nv(curB.oth?.longRange))}, Proposed ${fmt.c(nv(propB.oth?.longRange))}`,
    ``,
    `RATIOS`,
    `- Operating Ratio: Current ${r2(operatingRatio(revCur.monthly, curBT.total))}, Proposed ${r2(operatingRatio(revProp.monthly, propBT.total))} (benchmark ≥ 1.25)`,
    `- Debt Service Coverage (DSCR): Current ${r2(debtServiceCoverage(curB, revCur.monthly))}, Proposed ${r2(debtServiceCoverage(propB, revProp.monthly))} (covenant benchmark ≥ 1.25; N/A = no debt in budget)`,
    `- Affordability Index: Current ${fmt.pd(affordabilityIndex(classes, false, mhi), 'N/A')}, Proposed ${fmt.pd(affordabilityIndex(classes, true, mhi), 'N/A')} (< 2.00% EPA affordable; > 1.50% supports USDA RD grant eligibility)`,
    `- Debt-to-Income: Current ${fmt.pd(debtToIncome(curB, revCur.monthly), 'N/A')}, Proposed ${fmt.pd(debtToIncome(propB, revProp.monthly), 'N/A')} (benchmark < 45%)`,
    `- Base-Only Coverage: Current ${fmt.pd(baseCoverage(classes, false, curBT.total), 'N/A')}, Proposed ${fmt.pd(baseCoverage(classes, true, propBT.total), 'N/A')} (benchmark ≥ 100%)`,
    `- Cost per 1,000 gal: Current ${fmt.cd(costPer1000(curB, classes, false), 'N/A')}, Proposed ${fmt.cd(costPer1000(propB, classes, true), 'N/A')}`,
    `- Bill at 5,000 gal: Current ${fmt.cd(cost5000(classes, false), 'N/A — no rates entered')}, Proposed ${fmt.cd(cost5000(classes, true), 'N/A — no rates entered')}`,
    `- Monthly Median Household Income (MHI): ${mhi ? fmt.c(mhi) : 'NOT ENTERED — flag as data gap'}`,
    ``,
    `TRUE COST OF SERVICE (annual)`,
    `- Current:  expenses ${fmt.c(tcsCur.annualExpenses)}, gallons sold ${fmt.n(tcsCur.annualGallons)}, cost/1k gal ${fmt.cd(tcsCur.costPer1k, 'N/A')}, revenue/1k gal ${fmt.cd(tcsCur.revenuePer1k, 'N/A')}, break-even adjustment ${tcsCur.breakEvenAdjustment == null ? 'N/A' : (tcsCur.breakEvenAdjustment * 100).toFixed(1) + '%'}`,
    `- Proposed: expenses ${fmt.c(tcsProp.annualExpenses)}, gallons sold ${fmt.n(tcsProp.annualGallons)}, cost/1k gal ${fmt.cd(tcsProp.costPer1k, 'N/A')}, revenue/1k gal ${fmt.cd(tcsProp.revenuePer1k, 'N/A')}, break-even adjustment ${tcsProp.breakEvenAdjustment == null ? 'N/A' : (tcsProp.breakEvenAdjustment * 100).toFixed(1) + '%'}`,
    ``,
    `5-YEAR PROJECTION (proposed rates + proposed budget, ${study.forecast?.inflationRate || 3}% inflation on operating expenses)`,
    proj.yrs.map((yr, i) => `- ${yr}: Revenue ${fmt.c(proj.propRevArr[i])}, Expenses ${fmt.c(proj.propExpArr[i])}, Fund Balance ${fmt.c(proj.propFBArr[i])}`).join('\n'),
    `Target fund balance: ${fmt.c(target)} (FY5 proposed: ${fmt.c(proj.propFBArr[4] || 0)} — ${(proj.propFBArr[4] || 0) >= target ? 'on target' : 'below target'})`,
    debtSched.length > 0 ? `Scheduled annual debt service (overrides budget loan lines): ${(study.forecast?.debtService || []).map((v, i) => `FY${i + 1}=${String(v ?? '').trim() ? fmt.c(v) : 'budget default'}`).join(', ')}` : `No per-year debt schedule entered — debt from budget loan lines.`,
    knownRows.length > 0 ? `Known one-time items:\n${knownRows.map(it => `  - ${it.label || '(unnamed)'}: ${it.vals.map((v, i) => nv(v) !== 0 ? `FY${i + 1} ${fmt.c(nv(v))}` : null).filter(Boolean).join(', ')}`).join('\n')}` : `No known one-time items entered.`,
    ``,
    `CUSTOMER CLASSES (enabled only)`,
    classes.filter(c => c.enabled).map(c => {
      const ci = classMonthlyIncome(c, false);
      const pi = classMonthlyIncome(c, true);
      const brackets = usageBrackets(c);
      const distNote = brackets.length > 0
        ? ` — usage distribution: ${brackets.map(b => `${nv(b.customers)} @ ${fmt.n(nv(b.gallons))} gal`).join(', ')}`
        : ' — no usage distribution (average-based)';
      return `- ${c.name || c.id}: ${classCustomers(c, false) || classCustomers(c, true)} customers, ${fmt.c(ci.monthly)}/mo current → ${fmt.c(pi.monthly)}/mo proposed (Δ ${fmt.c(pi.monthly - ci.monthly)})${distNote}`;
    }).join('\n'),
  ].join('\n');
}

export function Step7({ study, onField }) {
  // `loading` lives in the module-level ai-jobs registry instead of local
  // state so an in-flight Generate/Follow-up survives navigation away from
  // Step 7 (and is still in flight when the user returns). The component
  // re-renders whenever the registry's busy set changes.
  const loading = useSyncExternalStore(
    subscribeAiJobs,
    () => isAiBusy(study.id),
    () => false,
  );
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(() => USE_AI_PROXY ? '' : safeGet(KEY_STORAGE) || BUILD_KEY);
  const [accessCode, setAccessCodeState] = useState(() => getAccessCode());
  const [modelChoice, setModelChoice] = useState(() => getSelectedModel());
  const [proxyConfig, setProxyConfig] = useState(() => getCachedAiConfig());
  const [configErr, setConfigErr] = useState('');
  // A 401 from the config endpoint means the server wants an access code but
  // proxyConfig stays empty — track it so the code field still shows.
  const [needsAccessCode, setNeedsAccessCode] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const usingBuildKey = !USE_AI_PROXY && !safeGet(KEY_STORAGE) && !!BUILD_KEY;
  const [followUp, setFollowUp] = useState('');
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // In proxy mode, load the server's enabled models for the picker.
  useEffect(() => {
    if (!USE_AI_PROXY) return;
    let cancelled = false;
    fetchAiConfig()
      .then(c => { if (!cancelled) { setProxyConfig(c); setConfigErr(''); setNeedsAccessCode(!!c?.authRequired); } })
      .catch(e => { if (!cancelled) { setConfigErr(e.message || String(e)); setNeedsAccessCode(e.status === 401); } });
    return () => { cancelled = true; };
  }, []);

  const models = USE_AI_PROXY ? (proxyConfig?.models || []) : DIRECT_MODELS;
  const defaultModelId = USE_AI_PROXY ? (proxyConfig?.defaultModel || '') : 'claude-opus-4-8';

  // The AI conversation history. Each entry: { role: 'user' | 'assistant', content: string }.
  // We store the full history on the study so it persists across sessions.
  // Migration: studies created before chat support only have aiAnalysis.content.
  // Surface that as a synthetic single-turn history so the user can see and follow up on it.
  const rawHistory = Array.isArray(study.aiHistory) ? study.aiHistory : [];
  const legacyContent = study.aiAnalysis && typeof study.aiAnalysis === 'object'
    ? (study.aiAnalysis.content || '')
    : (typeof study.aiAnalysis === 'string' ? study.aiAnalysis : '');
  const legacy = rawHistory.length === 0 && legacyContent
    ? [
        { role: 'user', content: '(Original analysis generated before chat history was tracked. Send a follow-up below to refine it.)' },
        { role: 'assistant', content: legacyContent },
      ]
    : null;
  const history = legacy || rawHistory;
  const lastAssistantMsg = [...history].reverse().find(m => m && m.role === 'assistant');
  const lastAnalysis = lastAssistantMsg?.content || '';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, loading]);

  const saveSettings = () => {
    if (!USE_AI_PROXY) safeSet(KEY_STORAGE, apiKey);
    setAccessCode(accessCode.trim());
    setSelectedModel(modelChoice);
    setShowKey(false);
    if (USE_AI_PROXY) {
      // Access code may have changed — re-check the server config.
      fetchAiConfig({ force: true })
        .then(c => { if (mountedRef.current) { setProxyConfig(c); setConfigErr(''); setNeedsAccessCode(!!c?.authRequired); } })
        .catch(e => { if (mountedRef.current) { setConfigErr(e.message || String(e)); setNeedsAccessCode(e.status === 401); } });
    }
  };

  function handleReply(reply, newHistory) {
    const replyText = reply.text;
    const finalHistory = [...newHistory, { role: 'assistant', content: replyText }];
    onField({
      aiHistory: finalHistory,
      aiAnalysis: { content: replyText, generatedAt: new Date().toISOString() },
    });
    if (mountedRef.current) {
      setNotice(reply.stopReason === 'max_tokens'
        ? 'The reply hit the length limit and may be cut off — ask a follow-up like "continue where you left off".'
        : '');
    }
  }

  function runInitial() {
    if (!USE_AI_PROXY && !apiKey) { setErr('Set your AI API key first (Settings).'); return; }
    setErr(''); setNotice('');
    // Snapshot study at click time, but write the result via onField (patch
    // form) so it merges against the LATEST study in App state. Fire-and-
    // forget: startAiJob keeps the promise alive even if Step 7 unmounts.
    startAiJob(study.id, async () => {
      try {
        const ctx = buildContext(study);
        const userMsg = `${ctx}\n\n---\n\nPlease analyze this water rate study and produce the standard board-ready report (Executive Summary → Financial Health → True Cost of Service → Rate Justification → Affordability → Risk Flags → Recommendations → Suggested Motion Language). Be specific with numbers.`;
        const newHistory = [{ role: 'user', content: userMsg }];
        const reply = await chat({ system: SYSTEM_PROMPT, history: newHistory });
        handleReply(reply, newHistory);
      } catch (e) {
        console.error('AI analysis failed', e);
        if (mountedRef.current) setErr(e.message || String(e));
      }
    });
  }

  function sendFollowUp() {
    const text = followUp.trim();
    if (!text) return;
    if (!USE_AI_PROXY && !apiKey) { setErr('Set your AI API key first (Settings).'); return; }
    setErr(''); setNotice('');
    setFollowUp('');
    const historyAtClick = history;
    startAiJob(study.id, async () => {
      try {
        const newHistory = [...historyAtClick, { role: 'user', content: text }];
        const reply = await chat({ system: SYSTEM_PROMPT, history: newHistory });
        handleReply(reply, newHistory);
      } catch (e) {
        console.error('AI follow-up failed', e);
        if (mountedRef.current) {
          setErr(e.message || String(e));
          // Restore the unsent text so the user can retry without retyping
          setFollowUp(text);
        }
      }
    });
  }

  function clearConversation() {
    // Close the modal first, then defer the destructive write so the modal's
    // click event finishes propagating before the parent re-render cascade.
    setConfirmClear(false);
    defer(() => onField({ aiHistory: [], aiAnalysis: { content: '', generatedAt: '' } }));
  }

  // The first user message is huge (full data dump). Hide it from the UI.
  const visibleHistory = history.length > 0 ? history.slice(1) : [];

  const QUICK_PROMPTS = [
    'Rewrite the Executive Summary in simpler language a non-financial board member could understand.',
    'Make the Risk Flags section more direct — list the top 3 risks in priority order.',
    'Add a paragraph explaining what these changes mean for a typical residential customer using 5,000 gallons.',
    'Explain the True Cost of Service numbers in one short paragraph for the board.',
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
          <button className="btn b-out btn-sm" onClick={() => setShowKey(s => !s)} title="AI connection settings">⚙ Settings</button>
          {history.length > 0 && (
            <button className="btn b-out btn-sm" onClick={() => setConfirmClear(true)}>Clear</button>
          )}
          {history.length === 0 && (
            <button className="btn b-teal" onClick={runInitial} disabled={loading}>
              {loading ? <><span className="spin" /> Generating…</> : 'Generate Analysis'}
            </button>
          )}
        </div>
      </div>

      {confirmClear && (
        <ConfirmModal
          title="Clear AI conversation?"
          message="The current analysis and chat history will be discarded, and the latest reply will be removed from the report. Your study data is unaffected."
          confirmLabel="Clear conversation"
          onConfirm={clearConversation}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {showKey && (
        <div className="card" style={{ background: 'var(--surface)' }}>
          <div className="sh">AI Connection</div>
          {USE_AI_PROXY ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
                Using the server-side AI proxy at <code>{AI_PROXY_URL}</code>. Provider API keys stay on the
                server; the models below are the ones the server has enabled.
              </p>
              {configErr && <div className="al al-w" style={{ fontSize: 11, marginBottom: 8 }}>{configErr}</div>}
              <div className="g2" style={{ alignItems: 'end' }}>
                <div className="fld">
                  <label className="flb">Model</label>
                  <select className="sel" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
                    <option value="">Server default{defaultModelId ? ` (${models.find(m => m.id === defaultModelId)?.label || defaultModelId})` : ''}</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.label} — {m.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}</option>
                    ))}
                  </select>
                  <span className="fhn">Used for analyses and rate suggestions. Quick lookups use the server's fast model.</span>
                </div>
                {(needsAccessCode || proxyConfig?.authRequired || accessCode) && (
                  <div className="fld">
                    <label className="flb">Access code</label>
                    <input className="inp" type="password" value={accessCode} onChange={(e) => setAccessCodeState(e.target.value)} placeholder="Provided by your administrator" />
                    <span className="fhn">Stored in this browser only.</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
                {usingBuildKey
                  ? 'Using the API key baked in at build time. Override here for this device only. Use this only for trusted local/internal builds.'
                  : "Local/internal direct-browser mode (Anthropic only): the key is stored in this browser's localStorage and required only for the AI features."}
              </p>
              <div className="g2" style={{ alignItems: 'end' }}>
                <div className="fld">
                  <label className="flb">Anthropic API key</label>
                  <input className="inp" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." />
                </div>
                <div className="fld">
                  <label className="flb">Model</label>
                  <select className="sel" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
                    <option value="">Default (Claude Opus 4.8)</option>
                    {DIRECT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn b-lime btn-sm" onClick={saveSettings}>Save</button>
          </div>
        </div>
      )}

      {err && <div className="al al-e">{err}</div>}
      {notice && <div className="al al-w">{notice}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div ref={scrollRef} style={{ maxHeight: 480, overflowY: 'auto', padding: 16 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--dim)' }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>🤖</div>
              <div style={{ fontSize: 12 }}>Click "Generate Analysis" to produce a board-ready analysis using the data captured across all steps.</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
                Best results when Steps 1–5 have full data, including a customer usage distribution in Step 2.
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
                  {String(m.content ?? '')}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', textAlign: 'center', padding: 8 }}>
              <span className="spin" /> Thinking…
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
