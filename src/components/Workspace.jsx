import { useState, useEffect } from 'react';
import { STEPS } from '../lib/constants.js';
import { fmt } from '../lib/calc.js';
import { statusMeta } from '../lib/status.js';
import { ConfirmModal } from './ConfirmModal.jsx';

// Compact "saved 3s ago" / "saved just now" indicator that re-renders every 10s.
function SavedAgo({ iso }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  let label;
  if (seconds < 5) label = 'just now';
  else if (seconds < 60) label = `${seconds}s ago`;
  else if (seconds < 3600) label = `${Math.round(seconds / 60)}m ago`;
  else if (seconds < 86400) label = `${Math.round(seconds / 3600)}h ago`;
  else label = fmt.short(iso);
  return (
    <span style={{ fontSize: 10, color: 'var(--lime-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime-dim)' }} /> Saved {label}
    </span>
  );
}
import { Step1 } from '../steps/Step1.jsx';
import { Step2 } from '../steps/Step2.jsx';
import { Step3 } from '../steps/Step3.jsx';
import { Step4 } from '../steps/Step4.jsx';
import { Step5 } from '../steps/Step5.jsx';
import { Step6 } from '../steps/Step6.jsx';
import { Step7 } from '../steps/Step7.jsx';
import { Step8 } from '../steps/Step8.jsx';

export function Workspace({ study, onUpdate, onDelete }) {
  const [step, setStep] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // field('foo', v) sets a single key.
  // field({ a, b }) patches multiple keys atomically — required when one
  // handler needs to set two fields back-to-back.
  // Uses the (id, patch) form of onUpdate so the merge happens against the
  // LATEST study in App state, not the closure-captured snapshot. This makes
  // long-running async writes (e.g. AI replies in Step 7) safe to land even
  // after the user has navigated away and edited other steps in the meantime.
  const field = (kOrPatch, v) => {
    const patch = typeof kOrPatch === 'string' ? { [kOrPatch]: v } : kOrPatch;
    const fullPatch = {
      ...patch,
      status: patch.status ?? (study.status === 'draft' && step > 0 ? 'in-progress' : study.status),
    };
    onUpdate(study.id, fullPatch);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="ws-bar no-print">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ws-t">{study.name}</div>
          <div className="ws-s">
            <span>
              {study.systemInfo.systemName || 'No system'}
              {study.systemInfo.pwsId ? ` — ${study.systemInfo.pwsId}` : ''}
            </span>
          </div>
        </div>
        <SavedAgo iso={study.updatedAt} />
        <span className={'bs ' + statusMeta(study.status).badgeClass}>
          {statusMeta(study.status).label}
        </span>
        <button
          className="btn b-del btn-sm"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete study ${study.name}`}
        >
          Delete
        </button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete this study?"
          message={
            <>
              <strong>{study.name}</strong>
              {study.systemInfo?.systemName ? <> — {study.systemInfo.systemName}</> : null}
              {study.systemInfo?.studyYear ? <> ({study.systemInfo.studyYear})</> : null}
              <br /><br />
              This permanently removes the study and all its rate, budget, and projection
              data from your browser. Export it first if you need a backup.
            </>
          }
          confirmLabel="Delete study"
          onConfirm={() => { setConfirmDelete(false); onDelete(study.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      <div className="tabs no-print">
        {STEPS.map(s => (
          <button key={s.id} className={'tab' + (step === s.id ? ' on' : '')} onClick={() => setStep(s.id)}>
            {s.l}
          </button>
        ))}
      </div>
      <div className="ws-sc">
        {step === 0 && <Step1 study={study} onField={field} />}
        {step === 1 && <Step2 study={study} onField={field} />}
        {step === 2 && <Step3 study={study} onField={field} />}
        {step === 3 && <Step4 study={study} />}
        {step === 4 && <Step5 study={study} onField={field} />}
        {step === 5 && <Step6 study={study} onField={field} />}
        {step === 6 && <Step7 study={study} onField={field} />}
        {step === 7 && <Step8 study={study} onField={field} />}
      </div>
      <div className="ws-nv no-print">
        <button className="btn b-out btn-sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Previous</button>
        <span className="ws-ni">Step {step + 1} of {STEPS.length}</span>
        <button className="btn b-teal btn-sm" onClick={() => setStep(s => Math.min(7, s + 1))} disabled={step === 7}>Next →</button>
      </div>
    </div>
  );
}
