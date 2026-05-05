import { useEffect, useRef } from 'react';
import { CHOCTAW_CENTER, CHOCTAW_ZOOM, KNOWN_SYSTEMS } from '../lib/choctaw-boundary.js';
import { CNO_DISTRICTS } from '../lib/cno-districts.js';

// 12-step palette for districts — distinct but in the brand family.
const DISTRICT_COLORS = [
  '#1E3D3B', '#287575', '#5A9400', '#76B900', '#a8e060', '#d97706',
  '#dc2626', '#1e40af', '#7c3aed', '#0891b2', '#0d9488', '#92400e',
];

// Convert a GeoJSON-style ring ([lng,lat]) to Leaflet's [[lat,lng]] format.
const toLeafletRings = (rings) => rings.map(r => r.map(p => [p[1], p[0]]));

// Lazy-loads Leaflet so it doesn't bloat the initial bundle.
async function loadLeaflet() {
  const L = await import('leaflet');
  await import('leaflet/dist/leaflet.css');
  return L.default || L;
}

export function MapView({ studies, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let map;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;

      const studyIcon = (status) => L.divIcon({
        className: '',
        iconSize: [22, 30],
        iconAnchor: [11, 28],
        popupAnchor: [0, -28],
        html: `<div style="width:22px;height:30px;position:relative">
          <svg viewBox="0 0 22 30" width="22" height="30">
            <path d="M11 0 C 4 0 0 5 0 11 C 0 18 11 30 11 30 C 11 30 22 18 22 11 C 22 5 18 0 11 0 Z"
                  fill="${status === 'complete' ? '#76B900' : status === 'in-progress' ? '#287575' : '#94a3b8'}"
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
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | CNO Council Districts: U.S. Census TIGER',
      }).addTo(map);

      // Render all 12 Choctaw Nation Council Districts with numbered labels
      const districtBounds = L.latLngBounds([]);
      CNO_DISTRICTS.forEach((d, i) => {
        const color = DISTRICT_COLORS[(d.n - 1) % DISTRICT_COLORS.length];
        const poly = L.polygon(toLeafletRings(d.rings), {
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.10,
        }).addTo(map);
        poly.bindTooltip(`${d.name} — ${d.member || 'Unassigned'}`, { sticky: true });
        districtBounds.extend(poly.getBounds());

        // District number label at centroid (CSS-styled marker, scales with zoom-ish)
        const [lng, lat] = d.center;
        const labelIcon = L.divIcon({
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: `<div style="
            width:28px;height:28px;border-radius:50%;
            background:${color};color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-family:Gill Sans Nova,Gill Sans MT,sans-serif;
            font-weight:700;font-size:13px;
            border:2px solid #fff;
            box-shadow:0 1px 4px rgba(0,0,0,.35);
            opacity:.92;
          ">${d.n}</div>`,
        });
        L.marker([lat, lng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(map);
      });
      // Default extent = full district coverage
      map.fitBounds(districtBounds, { padding: [10, 10] });

      // Reference PWS markers
      KNOWN_SYSTEMS.forEach(s => {
        L.marker([s.lat, s.lng], { icon: knownIcon })
          .bindPopup(`<div style="font-family:Gill Sans Nova,Gill Sans MT,sans-serif">
            <div style="font-weight:600;color:#1E3D3B;font-size:13px">${s.name}</div>
            <div style="color:#475569;font-size:11px;margin-top:2px">${s.county} County</div>
            <div style="color:#475569;font-size:11px">Source: ${s.waterBody}</div>
            <div style="color:#94a3b8;font-size:10px;margin-top:4px;font-style:italic">Reference location — no study yet</div>
          </div>`)
          .addTo(map);
      });

      // User study markers
      const studyMarkers = [];
      (studies || []).forEach(s => {
        const lat = s.systemInfo?.latitude;
        const lng = s.systemInfo?.longitude;
        if (lat == null || lng == null) return;
        const marker = L.marker([lat, lng], { icon: studyIcon(s.status) }).addTo(map);
        const popupHtml = `<div style="font-family:Gill Sans Nova,Gill Sans MT,sans-serif;min-width:180px">
          <div style="font-weight:600;color:#1E3D3B;font-size:13px">${escapeHtml(s.name)}</div>
          <div style="color:#475569;font-size:11px;margin-top:2px">${escapeHtml(s.systemInfo?.systemName || '—')}</div>
          ${s.systemInfo?.county ? `<div style="color:#475569;font-size:11px">${s.systemInfo.county} County</div>` : ''}
          ${s.systemInfo?.waterBodySource ? `<div style="color:#475569;font-size:11px">Source: ${escapeHtml(s.systemInfo.waterBodySource)}</div>` : ''}
          <div style="margin-top:6px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;background:${s.status === 'complete' ? '#76B900' : s.status === 'in-progress' ? '#287575' : '#94a3b8'};color:#fff">${s.status}</span></div>
          <button data-id="${s.id}" class="map-open-btn" style="margin-top:8px;padding:4px 10px;background:#1E3D3B;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit">Open Study →</button>
        </div>`;
        marker.bindPopup(popupHtml);
        marker.on('popupopen', (e) => {
          const btn = e.popup._contentNode.querySelector('.map-open-btn');
          if (btn) btn.onclick = () => onSelect?.(s.id);
        });
        studyMarkers.push(marker);
      });

      // Auto-fit if we have user studies; otherwise stay on full district view.
      if (studyMarkers.length > 0) {
        const group = L.featureGroup(studyMarkers);
        map.fitBounds(group.getBounds().pad(0.4));
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [studies, onSelect]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height: 540, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }} />
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--mid)', flexWrap: 'wrap', alignItems: 'center' }}>
        <Legend color="#76B900" label="Completed study" />
        <Legend color="#287575" label="In-progress study" />
        <Legend color="#94a3b8" label="Draft study" />
        <Legend color="#1E3D3B" label="Reference PWS (no study)" small />
        <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 10 }}>
          Numbered polygons = Choctaw Nation Council Districts 1–12. © OpenStreetMap contributors.
        </span>
      </div>
      <details style={{ marginTop: 10, fontSize: 11, color: 'var(--mid)' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--teal)', fontWeight: 500 }}>Council Member Roster</summary>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
          {[...CNO_DISTRICTS].sort((a, b) => a.n - b.n).map(d => (
            <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--surface)', borderRadius: 5 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: DISTRICT_COLORS[(d.n - 1) % DISTRICT_COLORS.length],
                color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{d.n}</span>
              <span style={{ fontSize: 11.5 }}>
                <strong style={{ color: 'var(--teal)' }}>District {d.n}:</strong> {d.member || 'Unassigned'}
              </span>
            </div>
          ))}
        </div>
      </details>
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
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
