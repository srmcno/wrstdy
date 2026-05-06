import { useEffect, useRef, useState } from 'react';
import { COUNTIES } from '../lib/constants.js';
import { F, $I } from '../components/atoms.jsx';
import { geocode } from '../lib/geocode.js';
import { ask, hasApiKey } from '../lib/ai.js';

export function Step1({ study, onField }) {
  const si = study.systemInfo;
  const dm = study.demographics || {};
  const usi = (k, v) => onField('systemInfo', { ...si, [k]: v });
  const usiMany = (patch) => onField('systemInfo', { ...si, ...patch });
  const udm = (k, v) => onField('demographics', { ...dm, [k]: v });

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const geocodeTimerRef = useRef(null);
  const nextGeocodeAtRef = useRef(0);

  useEffect(() => () => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
  }, []);

  function scheduleGeocode() {
    if (geoBusy) return;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeoMsg('Waiting briefly before geocoding to avoid rapid repeat requests…');
    geocodeTimerRef.current = setTimeout(doGeocode, 300);
  }

  async function doGeocode() {
    const now = Date.now();
    if (now < nextGeocodeAtRef.current) {
      const waitSeconds = Math.ceil((nextGeocodeAtRef.current - now) / 1000);
      setGeoMsg(`Please wait ${waitSeconds}s before geocoding again.`);
      return;
    }
    nextGeocodeAtRef.current = now + 1100;
    setGeoMsg(''); setGeoBusy(true);
    try {
      const addr = si.address || si.systemName;
      if (!addr) throw new Error('Enter an address or system name first.');
      const r = await geocode(addr, { county: si.county });
      usiMany({ latitude: r.latitude, longitude: r.longitude });
      setGeoMsg(`✓ Found: ${r.displayName.slice(0, 80)}`);
    } catch (e) {
      setGeoMsg('✗ ' + (e.message || String(e)));
    } finally {
      setGeoBusy(false);
    }
  }

  async function aiEstimate() {
    setAiMsg(''); setAiBusy(true);
    try {
      const sysPrompt = `You are a research assistant helping the Choctaw Nation Office of Water Resource Management estimate baseline information for a public water system in southeastern Oklahoma. Given a system name and county, return a JSON object with your best-effort estimates. CLEARLY mark every estimated value as estimated. If you genuinely don't know, leave the field empty rather than guess.

Return STRICT JSON only — no markdown, no commentary outside the JSON. Schema:
{
  "pwsId": "OK0000000 or empty",
  "sourceType": "groundwater | surface | purchased | mixed",
  "systemType": "community | ntnc | tnc",
  "populationServed": "estimated number as string, or empty",
  "address": "city, state — best guess, or empty",
  "waterBodySource": "name of lake/river/aquifer if known, or empty",
  "monthlyMHI": "estimated monthly median household income for the area in dollars, or empty",
  "notes": "1-2 sentences on the source/uncertainty of these estimates"
}`;
      const user = `System name: ${si.systemName || '(not provided)'}
County: ${si.county || '(not provided)'}
State: Oklahoma`;
      const text = await ask({ system: sysPrompt, user, maxTokens: 600 });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI response was not JSON: ' + text.slice(0, 200));
      const j = JSON.parse(m[0]);
      const patch = {};
      if (j.pwsId && !si.pwsId) patch.pwsId = j.pwsId;
      if (j.sourceType) patch.sourceType = j.sourceType;
      if (j.systemType) patch.systemType = j.systemType;
      if (j.populationServed && !si.populationServed) patch.populationServed = j.populationServed;
      if (j.address && !si.address) patch.address = j.address;
      if (j.waterBodySource && !si.waterBodySource) patch.waterBodySource = j.waterBodySource;
      usiMany(patch);
      if (j.monthlyMHI && !dm.medianMonthlyHHI) {
        onField('demographics', { ...dm, medianMonthlyHHI: String(j.monthlyMHI) });
      }
      setAiMsg(`✓ Filled blank fields with AI estimates. ${j.notes || ''} Verify before publishing.`);
    } catch (e) {
      setAiMsg('✗ ' + (e.message || String(e)));
    } finally {
      setAiBusy(false);
    }
  }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 9, borderBottom: '1px solid var(--border)', marginBottom: 13 }}>
          <div className="sh" style={{ paddingBottom: 0, borderBottom: 'none', marginBottom: 0 }}>Location & Source</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn b-out btn-sm" onClick={scheduleGeocode} disabled={geoBusy} title="Look up coordinates from the address (uses OpenStreetMap)">
              {geoBusy ? '📍 Geocoding…' : '📍 Geocode'}
            </button>
            <button
              className="btn b-lime btn-sm"
              onClick={aiEstimate}
              disabled={aiBusy || !hasApiKey()}
              title={hasApiKey() ? 'Use AI to estimate blank fields from the system name + county' : 'Add an Anthropic API key in Step 7 → Settings to enable'}
            >
              {aiBusy ? '✨ Estimating…' : '✨ AI Estimate'}
            </button>
          </div>
        </div>
        <div className="g3" style={{ marginBottom: 14 }}>
          <F label="Address / City" hint="Used for the map">
            <input className="inp" value={si.address || ''} onChange={(e) => usi('address', e.target.value)} placeholder="123 Main St, Antlers" />
          </F>
          <F label="Latitude" hint="Auto-filled by Geocode">
            <input className="inp" type="number" step="0.0001" value={si.latitude ?? ''} onChange={(e) => usi('latitude', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="34.2317" />
          </F>
          <F label="Longitude" hint="Auto-filled by Geocode">
            <input className="inp" type="number" step="0.0001" value={si.longitude ?? ''} onChange={(e) => usi('longitude', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="-95.6219" />
          </F>
        </div>
        <div className="g3">
          <F label="Water Body / Source Name" hint="Lake, river, or aquifer the system pulls from">
            <input className="inp" value={si.waterBodySource || ''} onChange={(e) => usi('waterBodySource', e.target.value)} placeholder="Hugo Lake / Antlers Aquifer" />
          </F>
          <div /><div />
        </div>
        {geoMsg && <div style={{ fontSize: 11, color: geoMsg.startsWith('✓') ? 'var(--lime-dim)' : 'var(--red)', marginTop: 8 }}>{geoMsg}</div>}
        {aiMsg && <div style={{ fontSize: 11, color: aiMsg.startsWith('✓') ? 'var(--lime-dim)' : 'var(--red)', marginTop: 8 }}>{aiMsg}</div>}
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
