import { useState } from 'react';
import IconColorPicker from './IconColorPicker';
import '../css/MonumentIconEditor.css';

// ── Popover de personnalisation icône/couleur pour un point (monument-en-trajet
// ou point custom) — override léger sans passer par la carte.
export default function MonumentIconEditor({ name, icon, color, onSave, onClose }) {
  const [localIcon, setLocalIcon] = useState(icon || 'pin');
  const [localColor, setLocalColor] = useState(color || null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(localIcon, localColor);
    setSaving(false);
    onClose();
  }

  return (
    <>
      <div className="mie-backdrop" onClick={onClose} />
      <div className="mie-popover" role="dialog" aria-modal="true">
        <div className="mie-header">
          <span className="mie-title">{name}</span>
          <button className="mie-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <IconColorPicker icon={localIcon} color={localColor} onIconChange={setLocalIcon} onColorChange={setLocalColor} />

        <button className="mie-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? <div className="mie-spinner" /> : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}
