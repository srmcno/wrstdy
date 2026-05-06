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

export function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const fn = (t) => {
      setToasts(prev => [...prev, t]);
      if (t.duration > 0) {
        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), t.duration);
      }
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
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
