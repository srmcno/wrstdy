import { useState, useEffect, useMemo } from 'react';
import { STEPS } from '../lib/constants.js';
import { fmt } from '../lib/calc.js';
import { statusMeta } from '../lib/status.js';
import { stepCompletion, needsBackupReminder } from '../lib/progress.js';
import { validateStudy } from '../lib/validate.js';
import { can } from '../platform/host.js';
import { ConfirmModal } from './ConfirmModal.jsx';
import { Step1 } from '../steps/Step1.jsx';
import { Step2 } from '../steps/Step2.jsx';
import { Step3 } from '../steps/Step3.jsx';
import { Step4 } from '../steps/Step4.jsx';
import { Step5 } from '../steps/Step5.jsx';
import { Step6 } from '../steps/Step6.jsx';
import { Step7 } from '../steps/Step7.jsx';
import { Step8 } from '../steps/Step8.jsx';

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
    <span className="save-ind saved" title={iso ? `Last change ${fmt.date(iso)}` : undefined}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      Saved {label}
    </span>
  );
}

export function Workspace({ study, onUpdate, onDelete, onExport }) {
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
      // Any real edit moves a draft to in-progress — including Step 1, where
      // most identifying data is entered.
      status: patch.status ?? (study.status === 'draft' ? 'in-progress' : study.status),
    };
    onUpdate(study.id, fullPatch);
  };

  const completion = stepCompletion(study);
  const doneCount = completion.filter(Boolean).length;

  // Which steps have a blocking data issue, so the tab bar can point at the
  // step that needs attention instead of making staff open all eight.
  const errorSteps = useMemo(() => {
    const set = new Set();
    for (const f of validateStudy(study)) if (f.severity === 'error') set.add(f.step);
    return set;
  }, [study]);

  const stepProps = { study, onField: field };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ws-bar no-print">
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="ws-t">{study.name}</div>
          <div className="ws-s">
            <span>
              {study.systemInfo.systemName || 'No system'}
              {study.systemInfo.pwsId ? ` — ${study.systemInfo.pwsId}` : ''}
            </span>
          </div>
        </div>
        <SavedAgo iso={study.updatedAt} />
        {/* The backup reminder only makes sense where this browser is the only
            copy. When the host persists studies (SharePoint via Power Apps),
            there is nothing for the user to back up. */}
        {can('localPersistence') && needsBackupReminder(study) && (
          <button
            className="btn b-out btn-sm"
            onClick={() => onExport?.(study.id)}
            title="This study lives only in this browser's storage. Export a .json backup regularly."
            style={{ color: '#92400e', borderColor: '#fde68a', background: '#fffbeb' }}
          >
            ⚠ Not backed up — Export
          </button>
        )}
        <span className={'bs ' + statusMeta(study.status).badgeClass}>
          {statusMeta(study.status).label}
        </span>
        {onDelete && (
          <button
            className="btn b-del btn-sm"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete study ${study.name}`}
          >
            Delete
          </button>
        )}
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
              data. Export it first if you need a backup.
            </>
          }
          confirmLabel="Delete study"
          onConfirm={() => { setConfirmDelete(false); onDelete(study.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      <div className="tabs no-print" role="tablist" aria-label="Rate study steps">
        {STEPS.map(s => {
          const flagged = errorSteps.has(s.id);
          const done = completion[s.id];
          const hint = flagged
            ? 'Needs attention — a data check failed on this step'
            : done ? 'Has data entered' : 'No data entered yet';
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={step === s.id}
              className={'tab' + (step === s.id ? ' on' : '')}
              onClick={() => setStep(s.id)}
              title={hint}
            >
              {flagged
                ? <span className="tab-flag" aria-hidden="true">!</span>
                : done && <span className="tab-done" aria-hidden="true">✓</span>}
              {s.l}
              <span className="sr-only"> — {hint}</span>
            </button>
          );
        })}
      </div>
      <div
        className="ws-progress no-print"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={STEPS.length}
        aria-label={`${doneCount} of ${STEPS.length} steps have data`}
      >
        <div className="ws-progress-track" aria-hidden="true">
          <div className="ws-progress-fill" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
        </div>
        <span className="ws-progress-lbl" aria-hidden="true">{doneCount} of {STEPS.length} steps have data</span>
        {errorSteps.size > 0 && (
          <button
            className="btn b-out btn-xs"
            style={{ marginLeft: 'auto', color: '#991b1b', borderColor: '#fca5a5', background: '#fef2f2' }}
            onClick={() => setStep(7)}
            title="Open the Data Check panel in the Final Report"
          >
            ! {errorSteps.size} step{errorSteps.size === 1 ? '' : 's'} need attention
          </button>
        )}
      </div>
      <div className="ws-sc">
        {step === 0 && <Step1 {...stepProps} />}
        {step === 1 && <Step2 {...stepProps} />}
        {step === 2 && <Step3 {...stepProps} />}
        {step === 3 && <Step4 study={study} onGoToStep={setStep} />}
        {step === 4 && <Step5 {...stepProps} />}
        {step === 5 && <Step6 {...stepProps} />}
        {step === 6 && <Step7 {...stepProps} />}
        {step === 7 && <Step8 {...stepProps} onGoToStep={setStep} />}
      </div>
      <div className="ws-nv no-print">
        <button className="btn b-out btn-sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Previous</button>
        <span className="ws-ni">
          Step {step + 1} of {STEPS.length}
          <span className="sr-only">: {STEPS[step]?.l}</span>
        </span>
        <button className="btn b-teal btn-sm" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Next →</button>
      </div>
    </div>
  );
}
