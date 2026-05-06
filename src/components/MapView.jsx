import { useEffect, useRef, useState } from 'react';
import { CHOCTAW_CENTER, CHOCTAW_ZOOM, KNOWN_SYSTEMS } from '../lib/choctaw-boundary.js';
import { statusMeta } from '../lib/status.js';
import { defer } from '../lib/defer.js';

// Lazy-loads Leaflet so it doesn't bloat the initial bundle.
async function loadLeaflet() {
  const L = await import('leaflet');
  await import('leaflet/dist/leaflet.css');
  return L.default || L;
}

// Lazy-loads the CNO Council Districts geojson.
async function loadDistricts() {
  const mod = await import('../assets/cno-districts.json');
  return mod.default || mod;
}

export function MapView({ studies, onSelect, onCreateFromKnown }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ districts: null, labels: null });
  const [showDistricts, setShowDistricts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let map;
    (async () => {
      const [L, districts] = await Promise.all([loadLeaflet(), loadDistricts()]);
      if (cancelled || !containerRef.current) return;

      const studyIcon = (status) => L.divIcon({
        className: '',
        iconSize: [22, 30],
        iconAnchor: [11, 28],
        popupAnchor: [0, -28],
        html: `<div style="width:22px;height:30px;position:relative">
          <svg viewBox="0 0 22 30" width="22" height="30">
            <path d="M11 0 C 4 0 0 5 0 11 C 0 18 11 30 11 30 C 11 30 22 18 22 11 C 22 5 18 0 11 0 Z"
                  fill="${statusMeta(status).color}"
                  stroke="#fff" stroke-width="1.5"/>
            <circle cx="11" cy="11" r="4" fill="#fff"/>
          </svg>
        </div>`,
      });
      const knownIcon = L.divIcon({
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#1E3D3B;opacity:.6;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
      });

      map = L.map(containerRef.current, {
        center: CHOCTAW_CENTER,
        zoom: CHOCTAW_ZOOM,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Choctaw Nation Council Districts (real boundary from CNOCD geojson)
      const districtLayer = L.geoJSON(districts, {
        style: () => ({
          color: '#1E3D3B',
          weight: 1.5,
          fillColor: '#76B900',
          fillOpacity: 0.07,
          opacity: 0.85,
        }),
        onEachFeature: (feat, layer) => {
          const p = feat.properties || {};
          const num = p.NUM || p.NAME;
          const studiesIn = countStudiesInFeature(studies, feat);
          // Council member names intentionally not displayed — TIGER source data
          // is not authoritative for current officeholders. Update the geojson
          // and re-enable this row when refreshed from choctawnation.com.
          const popupHtml = `<div style="font-family:Gill Sans Nova,Gill Sans MT,sans-serif;min-width:160px">
            <div style="font-weight:600;color:#1E3D3B;font-size:13px">Council District ${num}</div>
            <div style="color:#475569;font-size:11px;margin-top:2px">Studies in district: ${studiesIn}</div>
          </div>`;
          layer.bindPopup(popupHtml);
          layer.on({
            mouseover: (e) => e.target.setStyle({ fillOpacity: 0.18, weight: 2 }),
            mouseout: (e) => districtLayer.resetStyle(e.target),
          });
        },
      });

      // Numbered badges at each district's interior point
      const labelLayer = L.layerGroup();
      districts.features.forEach((feat) => {
        const p = feat.properties || {};
        const lat = parseFloat(p.INTPTLAT);
        const lng = parseFloat(p.INTPTLON);
        if (!isFinite(lat) || !isFinite(lng)) return;
        const num = p.NUM || (p.NAME || '').replace(/\D/g, '') || '?';
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'cno-district-label',
            html: `<div class="cno-num" title="Council District ${num}">${num}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          interactive: false,
          keyboard: false,
        });
        labelLayer.addLayer(marker);
      });

      if (showDistricts) districtLayer.addTo(map);
      if (showLabels) labelLayer.addTo(map);
      layersRef.current = { districts: districtLayer, labels: labelLayer };

      // Known PWS reference markers
      KNOWN_SYSTEMS.forEach((s, idx) => {
        const marker = L.marker([s.lat, s.lng], { icon: knownIcon }).addTo(map);
        const sourceLabel = s.sourceType === 'surface' ? 'Surface water'
          : s.sourceType === 'groundwater' ? 'Groundwater (well)'
          : s.sourceType === 'purchased' ? 'Purchased / Wholesale'
          : s.sourceType === 'mixed' ? 'Mixed sources'
          : '—';
        const popupHtml = `<div style="font-family:Gill Sans Nova,Gill Sans MT,sans-serif;min-width:200px;max-width:260px">
          <div style="font-weight:600;color:#1E3D3B;font-size:13px;line-height:1.3">${escapeHtml(s.name)}</div>
          <div style="color:#475569;font-size:11px;margin-top:3px">${escapeHtml(s.county)} County, OK</div>
          ${s.address ? `<div style="color:#475569;font-size:11px">${escapeHtml(s.address)}</div>` : ''}
          <div style="margin-top:6px;font-size:11px;color:#475569;line-height:1.5">
            <div><strong style="color:#1E3D3B">Source:</strong> ${escapeHtml(s.waterBody)}</div>
            <div><strong style="color:#1E3D3B">Type:</strong> ${escapeHtml(sourceLabel)}</div>
            ${s.populationServed ? `<div><strong style="color:#1E3D3B">Pop. served:</strong> ~${escapeHtml(s.populationServed)}</div>` : ''}
          </div>
          <div style="color:#94a3b8;font-size:10px;margin-top:6px;font-style:italic">Reference location — no study yet</div>
          <button data-known-idx="${idx}" class="map-known-btn" style="margin-top:8px;padding:5px 10px;background:#76B900;color:#0a1f00;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">+ Start Study from this System</button>
        </div>`;
        marker.bindPopup(popupHtml);
        marker.on('popupopen', (e) => {
          const btn = e.popup._contentNode?.querySelector?.('.map-known-btn');
          // Defer the navigation: setActiveId in App synchronously unmounts
          // MapView (and runs map.remove()) which would tear down the popup
          // DOM mid-click and crash Leaflet's event dispatcher.
          if (btn) btn.onclick = () => defer(() => onCreateFromKnown?.(s));
        });
      });

      // User study markers
      const studyMarkers = [];
      (studies || []).forEach(s => {
        const lat = s.systemInfo?.latitude;
        const lng = s.systemInfo?.longitude;
        if (lat == null || lng == null) return;
        const meta = statusMeta(s.status);
        const marker = L.marker([lat, lng], { icon: studyIcon(s.status) }).addTo(map);
        const popupHtml = `<div style="font-family:Gill Sans Nova,Gill Sans MT,sans-serif;min-width:180px">
          <div style="font-weight:600;color:#1E3D3B;font-size:13px">${escapeHtml(s.name)}</div>
          <div style="color:#475569;font-size:11px;margin-top:2px">${escapeHtml(s.systemInfo?.systemName || '—')}</div>
          ${s.systemInfo?.county ? `<div style="color:#475569;font-size:11px">${escapeHtml(s.systemInfo.county)} County</div>` : ''}
          ${s.systemInfo?.waterBodySource ? `<div style="color:#475569;font-size:11px">Source: ${escapeHtml(s.systemInfo.waterBodySource)}</div>` : ''}
          <div style="margin-top:6px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;background:${meta.color};color:#fff">${escapeHtml(meta.label)}</span></div>
          <button data-id="${escapeHtml(s.id)}" class="map-open-btn" style="margin-top:8px;padding:4px 10px;background:#1E3D3B;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit">Open Study →</button>
        </div>`;
        marker.bindPopup(popupHtml);
        marker.on('popupopen', (e) => {
          const btn = e.popup._contentNode?.querySelector?.('.map-open-btn');
          if (btn) btn.onclick = () => defer(() => onSelect?.(s.id));
        });
        studyMarkers.push(marker);
      });

      // Fit to user studies if any, otherwise to the district extent
      if (studyMarkers.length > 0) {
        const group = L.featureGroup(studyMarkers);
        map.fitBounds(group.getBounds().pad(0.4));
      } else {
        try { map.fitBounds(districtLayer.getBounds().pad(0.05)); } catch { /* keep default */ }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (err) { console.warn('Leaflet teardown threw', err); }
        mapRef.current = null;
      }
      layersRef.current = { districts: null, labels: null };
    };
  }, [studies, onSelect]);

  // Toggle district / label visibility without rebuilding the whole map
  useEffect(() => {
    const map = mapRef.current;
    const { districts, labels } = layersRef.current;
    if (!map) return;
    if (districts) {
      if (showDistricts && !map.hasLayer(districts)) districts.addTo(map);
      if (!showDistricts && map.hasLayer(districts)) map.removeLayer(districts);
    }
    if (labels) {
      if (showLabels && !map.hasLayer(labels)) labels.addTo(map);
      if (!showLabels && map.hasLayer(labels)) map.removeLayer(labels);
    }
  }, [showDistricts, showLabels]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height: 520, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }} />
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--mid)', flexWrap: 'wrap', alignItems: 'center' }}>
        <Legend color="#76B900" label="Completed study" />
        <Legend color="#287575" label="In-progress study" />
        <Legend color="#94a3b8" label="Draft study" />
        <Legend color="#1E3D3B" label="Reference PWS (no study)" small />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className="cno-num" style={{ width: 16, height: 16, fontSize: 10 }}>3</span>
          Council District
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showDistricts} onChange={e => setShowDistricts(e.target.checked)} />
          Districts
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
          District numbers
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 10 }}>
          Boundaries: TIGER/Line CNO Council Districts. © OpenStreetMap contributors.
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label, small }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block',
        width: small ? 10 : 14,
        height: small ? 10 : 14,
        borderRadius: '50%',
        background: color,
        border: '1.5px solid #fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }} />
      {label}
    </span>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Ray-casting point-in-polygon for [lng, lat] rings
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInFeature(lng, lat, feat) {
  const g = feat.geometry || {};
  if (g.type === 'Polygon') {
    return pointInRing(lng, lat, g.coordinates[0]);
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates.some(poly => pointInRing(lng, lat, poly[0]));
  }
  return false;
}
function countStudiesInFeature(studies, feat) {
  if (!studies) return 0;
  let n = 0;
  for (const s of studies) {
    const lat = s.systemInfo?.latitude;
    const lng = s.systemInfo?.longitude;
    if (lat == null || lng == null) continue;
    if (pointInFeature(lng, lat, feat)) n++;
  }
  return n;
}
