import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSetting, setSetting } from '../platform/host.js';

const KEY = 'wrs-text-zoom';
const OPTIONS = [
  { v: 1.0, label: 'Normal' },
  { v: 1.1, label: 'Comfortable (default)' },
  { v: 1.25, label: 'Large' },
  { v: 1.4, label: 'Extra large' },
  { v: 1.6, label: 'Maximum' },
];
const DEFAULT = 1.1;
const MIN = 0.8;
const MAX = 2;

// Zoom is applied to the app's own root element, not <html>.
//
// Zooming the document worked when the app owned the whole page, but as a
// Power Apps code component that would scale the entire canvas app around it.
// App.jsx reads this store and puts the factor on `.wrs-app`; the width/height
// compensation there keeps the (now larger) app box filling its container.
let current = DEFAULT;
let loaded = false;
const listeners = new Set();

function clamp(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : DEFAULT;
}

function load() {
  if (loaded) return current;
  loaded = true;
  current = clamp(getSetting(KEY));
  return current;
}

function emit() { for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } }

export function setTextZoom(v) {
  const next = clamp(v);
  if (next === current) return;
  current = next;
  loaded = true;
  setSetting(KEY, String(next));
  emit();
}

export function getTextZoom() { return load(); }

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Current zoom factor, re-rendering the caller whenever it changes. */
export function useTextZoom() {
  return useSyncExternalStore(subscribe, getTextZoom, () => DEFAULT);
}

/**
 * Kept for the standalone entry point, which calls it before React mounts.
 * It now only primes the store from saved settings — the actual style is
 * applied by App.jsx, so there is no pre-mount flash to avoid.
 */
export function applyInitialTextSize() { load(); }

export function TextSizeMenu() {
  const zoom = useTextZoom();
  const [open, setOpen] = useState(false);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!e.target.closest?.('[data-text-size-menu]')) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const currentOption = OPTIONS.find(o => Math.abs(o.v - zoom) < 0.01) || { v: zoom, label: `${Math.round(zoom * 100)}%` };

  return (
    <div data-text-size-menu style={{ position: 'relative', marginRight: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Text size"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Text size, currently ${currentOption.label}`}
        style={{
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.9)',
          border: '1px solid rgba(255,255,255,.25)',
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
        <span style={{ fontSize: 10 }} aria-hidden="true">A</span>
        <span style={{ fontSize: 14 }} aria-hidden="true">A</span>
        <span style={{ marginLeft: 2, color: 'rgba(255,255,255,.75)', fontSize: 10 }}>{currentOption.label}</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
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
          }}
        >
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9.5, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Text Size</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 3 }}>Scales this tool only. Saved per browser.</div>
          </div>
          {OPTIONS.map(o => {
            const activeOpt = Math.abs(o.v - zoom) < 0.01;
            return (
              <button
                key={o.v}
                role="menuitemradio"
                aria-checked={activeOpt}
                onClick={() => { setTextZoom(o.v); setOpen(false); }}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: activeOpt ? 'var(--lime-pale)' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 12,
                  color: activeOpt ? 'var(--teal)' : 'var(--text)',
                  fontWeight: activeOpt ? 600 : 400,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{o.label}</span>
                <span style={{ fontSize: 10, color: 'var(--mid)' }}>{Math.round(o.v * 100)}%</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
