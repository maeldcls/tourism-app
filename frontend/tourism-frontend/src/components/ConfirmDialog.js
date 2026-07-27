import { useState } from 'react';
import '../css/ConfirmDialog.css';

// ── Popover générique de confirmation avant une action destructive ────────────
export default function ConfirmDialog({
  open,
  title = 'Confirmer la suppression',
  message,
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
}) {
  const [working, setWorking] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setWorking(true);
    await onConfirm();
    setWorking(false);
  }

  return (
    <>
      <div className="cfd-backdrop" onClick={() => !working && onCancel()} />
      <div className="cfd-popover" role="alertdialog" aria-modal="true">
        <div className="cfd-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
        </div>
        <h3 className="cfd-title">{title}</h3>
        {message && <p className="cfd-message">{message}</p>}
        <div className="cfd-actions">
          <button className="cfd-cancel-btn" onClick={onCancel} disabled={working}>
            {cancelLabel}
          </button>
          <button className="cfd-confirm-btn" onClick={handleConfirm} disabled={working}>
            {working ? <div className="cfd-spinner" /> : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
