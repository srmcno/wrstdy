import { useEffect, useRef } from 'react';

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key === 'Tab') {
        const a = cancelRef.current, b = confirmRef.current;
        if (!a || !b) return;
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      } else if (e.key === 'Enter' && document.activeElement === confirmRef.current) {
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="ov"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal" style={{ maxWidth: 420 }}>
        <h3 id="confirm-title" style={{ fontSize: 15, color: 'var(--teal)' }}>{title}</h3>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.55 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button ref={cancelRef} className="btn b-out" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={'btn ' + (destructive ? 'b-del' : 'b-lime')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
