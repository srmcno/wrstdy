import { COUNTIES } from '../lib/constants.js';
import { F, $I } from '../components/atoms.jsx';

export function Step1({ study, onField }) {
  const si = study.systemInfo;
  const dm = study.demographics || {};
  const usi = (k, v) => onField('systemInfo', { ...si, [k]: v });
  const udm = (k, v) => onField('demographics', { ...dm, [k]: v });
  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 15, color: 'var(--teal)', marginBottom: 3 }}>System Information</h2>
        <p style={{ color: 'var(--mid)', fontSize: 12 }}>Identifying details for this study and the public water system.</p>
      </div>
      <div className="card">
        <div className="sh">Study Details</div>
        <div className="g3">
          <F label="Study Name">
            <input className="inp" value={study.name} onChange={(e) => onField('name', e.target.value)} placeholder={`Rate Study ${new Date().getFullYear()}`} />
          </F>
          <F label="Study Year">
            <input className="inp" type="number" value={si.studyYear} onChange={(e) => usi('studyYear', e.target.value)} />
          </F>
          <F label="Status">
            <select className="sel" value={study.status} onChange={(e) => onField('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="in-progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </F>
        </div>
      </div>
      <div className="card">
        <div className="sh">Public Water System</div>
        <div className="g3" style={{ marginBottom: 14 }}>
          <F label="System Name">
            <input className="inp" value={si.systemName} onChange={(e) => usi('systemName', e.target.value)} placeholder="e.g. Smithville Rural Water District" />
          </F>
          <F label="PWS ID" hint="Format: OK0000000">
            <input className="inp" value={si.pwsId} onChange={(e) => usi('pwsId', e.target.value)} placeholder="OK0000000" />
          </F>
          <F label="County">
            <select className="sel" value={si.county} onChange={(e) => usi('county', e.target.value)}>
              <option value="">Select county...</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </F>
        </div>
        <div className="g3">
          <F label="Population Served">
            <input className="inp" type="number" value={si.populationServed} onChange={(e) => usi('populationServed', e.target.value)} placeholder="450" />
          </F>
          <F label="Source Type">
            <select className="sel" value={si.sourceType} onChange={(e) => usi('sourceType', e.target.value)}>
              <option value="groundwater">Groundwater (Well)</option>
              <option value="surface">Surface Water</option>
              <option value="purchased">Purchased / Wholesale</option>
              <option value="mixed">Mixed Sources</option>
            </select>
          </F>
          <F label="System Type">
            <select className="sel" value={si.systemType} onChange={(e) => usi('systemType', e.target.value)}>
              <option value="community">Community Water System</option>
              <option value="ntnc">Non-Transient Non-Community</option>
              <option value="tnc">Transient Non-Community</option>
            </select>
          </F>
        </div>
      </div>
      <div className="card">
        <div className="sh">Demographics & MHI</div>
        <div className="g3">
          <F label="Median Monthly HHI ($)" hint="Census ACS 5-year estimate — used for Affordability Index">
            <$I value={dm.medianMonthlyHHI} onChange={(v) => udm('medianMonthlyHHI', v)} />
          </F>
          <F label="Effective Date (Proposed Rates)">
            <input className="inp" type="date" value={dm.effectiveDate || ''} onChange={(e) => udm('effectiveDate', e.target.value)} />
          </F>
          <div />
        </div>
      </div>
      <div className="card">
        <div className="sh">Contact Information</div>
        <div className="g3">
          <F label="Primary Contact">
            <input className="inp" value={si.ownerContact} onChange={(e) => usi('ownerContact', e.target.value)} placeholder="Manager / Operator Name" />
          </F>
          <F label="Email">
            <input className="inp" type="email" value={si.contactEmail} onChange={(e) => usi('contactEmail', e.target.value)} placeholder="contact@example.com" />
          </F>
          <F label="Phone">
            <input className="inp" type="tel" value={si.contactPhone} onChange={(e) => usi('contactPhone', e.target.value)} placeholder="(580) 000-0000" />
          </F>
        </div>
      </div>
    </div>
  );
}
