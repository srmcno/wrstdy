import { useEffect, useState } from 'react';

const KEY = 'wrs-text-zoom';
const OPTIONS = [
  { v: 1.0, label: 'Normal' },
  { v: 1.1, label: 'Comfortable (default)' },
  { v: 1.25, label: 'Large' },
  { v: 1.4, label: 'Extra large' },
  { v: 1.6, label: 'Maximum' },
];
const DEFAULT = 1.1;

function readZoom() {
  try {
    const raw = parseFloat(localStorage.getItem(KEY) || '');
    if (Number.isFinite(raw) && raw >= 0.8 && raw <= 2) return raw;
  } catch { /* opaque origin */ }
  return DEFAULT;
}

function applyZoom(z) {
  // `zoom` is supported in Chromium, Safari, and modern Firefox (≥126).
  // It scales the entire app — fonts, padding, charts — proportionally,
  // which is what we want for an internal tool with mostly px-based sizing.
  if (typeof document !== 'undefined') {
    document.documentElement.style.zoom = String(z);
  }
}

export function applyInitialTextSize() {
  applyZoom(readZoom());
}

export function TextSizeMenu() {
  const [zoom, setZoom] = useState(readZoom());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    applyZoom(zoom);
    try { localStorage.setItem(KEY, String(zoom)); } catch { /* ignore */ }
  }, [zoom]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-text-size-menu]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = OPTIONS.find(o => Math.abs(o.v - zoom) < 0.01) || { v: zoom, label: `${Math.round(zoom * 100)}%` };

  return (
    <div data-text-size-menu style={{ position: 'relative', marginRight: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Text size"
        style={{
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.85)',
          border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 6,
          padding: '5px 10px',
          fontFamily: 'var(--font)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '.04em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <span style={{ fontSize: 10 }}>A</span><span style={{ fontSize: 14 }}>A</span>
        <span style={{ marginLeft: 2, color: 'rgba(255,255,255,.55)', fontSize: 10 }}>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: 'var(--sh2)',
          minWidth: 220,
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9.5, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Text Size</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 3 }}>Scales the entire app. Saved per browser.</div>
          </div>
          {OPTIONS.map(o => {
            const active = Math.abs(o.v - zoom) < 0.01;
            return (
              <button
                key={o.v}
                onClick={() => { setZoom(o.v); setOpen(false); }}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: active ? 'var(--lime-pale)' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 12,
                  color: active ? 'var(--teal)' : 'var(--text)',
                  fontWeight: active ? 600 : 400,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{o.label}</span>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>{Math.round(o.v * 100)}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
