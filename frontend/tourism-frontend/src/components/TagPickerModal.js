import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/TagPickerModal.css';

const API = API_URL;
const MAX_TAGS = 3;

export default function TagPickerModal({ monumentId, userTagIds, onClose, onChanged }) {
  const { user, token } = useAuth();
  const isAdmin = !!user?.is_admin;

  const [allTags, setAllTags] = useState([]);
  const [selected, setSelected] = useState(new Set(userTagIds));
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/tags`)
      .then(r => r.json())
      .then(data => setAllTags(Array.isArray(data) ? data : []))
      .catch(() => setAllTags([]));
  }, []);

  async function handleAssign(tagId) {
    if (busyId) return;
    if (!isAdmin && selected.has(tagId)) return;
    if (!isAdmin && selected.size >= MAX_TAGS) {
      setError(`Maximum ${MAX_TAGS} tags par monument.`);
      return;
    }

    setBusyId(tagId);
    setError(null);
    try {
      const r = await fetch(`${API}/monuments/${monumentId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tag_id: tagId }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Erreur');
      setSelected(prev => new Set(prev).add(tagId));
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(tagId) {
    if (busyId) return;
    setBusyId(tagId);
    setError(null);
    try {
      const r = await fetch(`${API}/monuments/${monumentId}/tags/${tagId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setSelected(prev => { const next = new Set(prev); next.delete(tagId); return next; });
      onChanged();
    } catch {
      setError('Erreur lors du retrait du tag.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="tagpicker-overlay" onClick={onClose}>
      <div className="tagpicker-sheet" onClick={e => e.stopPropagation()}>
        <div className="tagpicker-head">
          <h2 className="tagpicker-title">Choisir des tags</h2>
          <button className="tagpicker-close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <p className="tagpicker-hint">
          {isAdmin
            ? 'Compte admin : sélection illimitée, pratique pour tester.'
            : `${selected.size}/${MAX_TAGS} tags sélectionnés`}
        </p>

        {error && <p className="tagpicker-error">{error}</p>}

        <div className="tagpicker-grid">
          {allTags.map(t => {
            const isSelected = selected.has(t.id);
            const disabled = busyId === t.id || (!isAdmin && !isSelected && selected.size >= MAX_TAGS);
            return (
              <div
                key={t.id}
                className={`tagpicker-chip tagpicker-chip--${t.sentiment}${isSelected ? ' tagpicker-chip--active' : ''}${(disabled && !isSelected) ? ' tagpicker-chip--disabled' : ''}`}
                onClick={() => { if (!(disabled && !isSelected)) (isSelected && !isAdmin ? handleRemove(t.id) : handleAssign(t.id)); }}
              >
                <span>{t.emoji} {t.label}</span>
                {isSelected && (
                  <button
                    type="button"
                    className="tagpicker-chip-remove"
                    aria-label={`Retirer ${t.label}`}
                    onClick={e => { e.stopPropagation(); handleRemove(t.id); }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
