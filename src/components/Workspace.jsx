import { useState } from 'react';
import { STEPS } from '../lib/constants.js';
import { fmt } from '../lib/calc.js';
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
  const field = (k, v) => onUpdate({
    ...study,
    [k]: v,
    updatedAt: new Date().toISOString(),
    status: study.status === 'draft' && step > 0 ? 'in-progress' : study.status
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="ws-bar no-print">
        <div style={{ flex: 1 }}>
          <div className="ws-t">{study.name}</div>
          <div className="ws-s">
            {study.systemInfo.systemName || 'No system'}
            {study.systemInfo.pwsId ? ` — ${study.systemInfo.pwsId}` : ''}
            {' — Saved '}{fmt.short(study.updatedAt)}
          </div>
        </div>
        <span className={'bs ' + (study.status === 'complete' ? 'bsc' : study.status === 'in-progress' ? 'bsp' : 'bsd')}>
          {study.status}
        </span>
        <button
          className="btn b-del btn-sm"
          onClick={() => { if (window.confirm('Delete this study?')) onDelete(study.id); }}
        >
          Delete
        </button>
      </div>
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
        {step === 5 && <Step6 study={study} />}
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
