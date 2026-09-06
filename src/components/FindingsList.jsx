import { stepName, summarizeFindings } from '../lib/validate.js';

const PILL = {
  error: { cls: 'sc-bad', label: 'Fix' },
  warn: { cls: 'sc-warn', label: 'Check' },
  info: { cls: 'sc-neu', label: 'Note' },
};

/**
 * Renders the data-quality findings for a study.
 *
 * Findings are advisory — staff can and do publish studies with open notes
 * (some data genuinely isn't available from a small system). The point is that
 * the gaps are visible before the report reaches a board, and are named
 * alongside the step that fixes them.
 */
export function FindingsList({ findings = [], onGoToStep, emptyMessage }) {
  if (findings.length === 0) {
    return (
      <div className="al al-ok" style={{ fontSize: 12 }}>
        {emptyMessage || 'No data-quality issues found. Every check this tool runs came back clean — the numbers still depend on the accuracy of what the system provided.'}
      </div>
    );
  }
  return (
    <div>
      {findings.map(f => {
        const pill = PILL[f.severity] || PILL.info;
        return (
          <div className="find" key={f.id}>
            <div className="find-s">
              <span className={'sc-pill ' + pill.cls}>{pill.label}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="find-t">{f.title}</div>
              <div className="find-d">{f.detail}</div>
              {onGoToStep && (
                <button
                  className="btn b-out btn-xs no-print"
                  style={{ marginTop: 6 }}
                  onClick={() => onGoToStep(f.step)}
                >
                  Go to {stepName(f.step)}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One-line "3 to fix · 2 to check" summary for headers and banners. */
export function FindingsSummary({ findings = [] }) {
  const s = summarizeFindings(findings);
  if (s.total === 0) return <span style={{ color: 'var(--lime-dim)' }}>All checks passed</span>;
  const parts = [];
  if (s.error) parts.push(`${s.error} to fix`);
  if (s.warn) parts.push(`${s.warn} to check`);
  if (s.info) parts.push(`${s.info} note${s.info === 1 ? '' : 's'}`);
  return <span style={{ color: s.error ? 'var(--red)' : 'var(--mid)' }}>{parts.join(' · ')}</span>;
}
