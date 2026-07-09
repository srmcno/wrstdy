import { useEffect, useRef, useState } from 'react';
import { COUNTY_GROUPS } from '../lib/constants.js';
import { newStudy } from '../lib/state.js';
import { F } from './atoms.jsx';

export function NewStudyModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [sys, setSys] = useState('');
  const [county, setCounty] = useState('');
  const firstRef = useRef(null);
  const lastRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        // Trap focus within the modal
        const first = firstRef.current;
        const last = lastRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = () => {
    const s = newStudy(name || `Rate Study ${new Date().getFullYear()}`);
    s.systemInfo.systemName = sys;
    s.systemInfo.county = county;
    onCreate(s);
  };

  return (
    <div
      className="ov"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-study-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3 id="new-study-title" style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 18 }}>New Rate Study</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <F label="Study Name">
            <input
              ref={firstRef}
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Rate Study ${new Date().getFullYear()}`}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          </F>
          <F label="System Name (optional)">
            <input
              className="inp"
              value={sys}
              onChange={(e) => setSys(e.target.value)}
              placeholder="e.g. Smithville Rural Water District"
            />
          </F>
          <F label="County (optional)">
            <select className="sel" value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">Select county...</option>
              {COUNTY_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.counties.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </F>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn b-out" onClick={onClose}>Cancel</button>
          <button ref={lastRef} className="btn b-lime" onClick={go}>Create Study</button>
        </div>
      </div>
    </div>
  );
}
