import { useEffect, useRef } from 'react';
import { CHOCTAW_BOUNDARY, CHOCTAW_CENTER, CHOCTAW_ZOOM, KNOWN_SYSTEMS } from '../lib/choctaw-boundary.js';

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

      // Fix Leaflet's default-icon path (the bundled images break under file:// or hashed builds).
      // We use an inline SVG marker instead.
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
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Choctaw Nation approximate boundary
      L.polygon(CHOCTAW_BOUNDARY, {
        color: '#1E3D3B',
        weight: 2.5,
        fillColor: '#76B900',
        fillOpacity: 0.06,
        dashArray: '6,4',
      }).bindTooltip('Choctaw Nation Reservation (approximate)', { sticky: true }).addTo(map);

      // Known PWS reference markers
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

      // Auto-fit if we have any user studies, otherwise show full reservation
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
      <div ref={containerRef} style={{ height: 520, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }} />
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--mid)', flexWrap: 'wrap' }}>
        <Legend color="#76B900" label="Completed study" />
        <Legend color="#287575" label="In-progress study" />
        <Legend color="#94a3b8" label="Draft study" />
        <Legend color="#1E3D3B" label="Reference PWS (no study)" small />
        <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 10 }}>
          Boundary is an approximation for visual reference. © OpenStreetMap contributors.
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
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
