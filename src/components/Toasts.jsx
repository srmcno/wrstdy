import { useEffect, useState } from 'react';

// Module-level subscriber list so any component can fire `pushToast()` without
// prop-drilling a context. Mounting <ToastHost /> once at the app root listens
// for and renders them.
const listeners = new Set();
let nextId = 1;

export function pushToast(message, opts = {}) {
  const t = {
    id: nextId++,
    message,
    kind: opts.kind || 'ok',     // 'ok' | 'warn' | 'err'
    duration: opts.duration ?? (opts.kind === 'err' ? 7000 : 3500),
  };
  listeners.forEach(fn => fn(t));
  return t.id;
}

// Toasts stack up during a bulk action (importing several studies, a run of
// failed exports). Past this many the oldest are dropped so the stack can
// never cover the app it is reporting on.
const MAX_VISIBLE = 4;

export function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // Auto-dismiss timers are tracked so unmounting clears them instead of
    // leaving them to fire setState on a dead component.
    const timers = new Set();
    const fn = (t) => {
      setToasts(prev => [...prev, t].slice(-MAX_VISIBLE));
      if (t.duration > 0) {
        const id = setTimeout(() => {
          timers.delete(id);
          setToasts(prev => prev.filter(x => x.id !== t.id));
        }, t.duration);
        timers.add(id);
      }
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            className="toast-x"
            aria-label="Dismiss notification"
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
