import { useState } from 'react';
import { COUNTIES } from '../lib/constants.js';
import { newStudy } from '../lib/state.js';
import { F } from './atoms.jsx';

export function NewStudyModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [sys, setSys] = useState('');
  const [county, setCounty] = useState('');
  const go = () => {
    const s = newStudy(name || `Rate Study ${new Date().getFullYear()}`);
    s.systemInfo.systemName = sys;
    s.systemInfo.county = county;
    onCreate(s);
  };
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 400 }}>
        <h3 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 18 }}>New Rate Study</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <F label="Study Name">
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Rate Study ${new Date().getFullYear()}`}
              autoFocus
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
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </F>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn b-out" onClick={onClose}>Cancel</button>
          <button className="btn b-lime" onClick={go}>Create Study</button>
        </div>
      </div>
    </div>
  );
}
