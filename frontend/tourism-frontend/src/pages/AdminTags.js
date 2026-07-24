import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/AdminTags.css';

const API = API_URL;

const SENTIMENTS = [
  { key: 'positive', label: 'Positif' },
  { key: 'neutral',  label: 'Neutre' },
  { key: 'negative', label: 'Négatif' },
];

const EMPTY_FORM = { label: '', emoji: '', sentiment: 'neutral' };

export default function AdminTags() {
  const { user, token } = useAuth();

  const [tags, setTags]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag]   = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState(EMPTY_FORM);
  const [error, setError]     = useState(null);

  const fetchTags = useCallback(() => {
    setLoading(true);
    fetch(`${API}/admin/tags`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setTags(Array.isArray(data) ? data : []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (user?.is_admin) fetchTags(); }, [user, fetchTags]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newTag.label.trim() || !newTag.emoji.trim() || creating) return;

    setCreating(true);
    setError(null);
    try {
      const r = await fetch(`${API}/admin/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTag),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Erreur');
      setNewTag(EMPTY_FORM);
      fetchTags();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id);
    setEditForm({ label: tag.label, emoji: tag.emoji, sentiment: tag.sentiment });
  }

  async function handleSaveEdit(tagId) {
    setError(null);
    try {
      const r = await fetch(`${API}/admin/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Erreur');
      setEditingId(null);
      fetchTags();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(tagId) {
    try {
      const r = await fetch(`${API}/admin/tags/${tagId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setTags(prev => prev.filter(t => t.id !== tagId));
    } catch {
      // laisse la liste en place, l'admin peut réessayer
    }
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!user.is_admin) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <p>Accès réservé aux administrateurs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1 className="admin-title">Gestion des tags</h1>
      <p className="admin-subtitle">Tags que les utilisateurs peuvent assigner aux monuments.</p>

      <form className="tags-create-form" onSubmit={handleCreate}>
        <input
          className="tags-input tags-input--emoji"
          placeholder="🙂"
          value={newTag.emoji}
          onChange={e => setNewTag(f => ({ ...f, emoji: e.target.value }))}
          maxLength={10}
        />
        <input
          className="tags-input tags-input--label"
          placeholder="Nom du tag"
          value={newTag.label}
          onChange={e => setNewTag(f => ({ ...f, label: e.target.value }))}
          maxLength={100}
        />
        <select
          className="tags-select"
          value={newTag.sentiment}
          onChange={e => setNewTag(f => ({ ...f, sentiment: e.target.value }))}
        >
          {SENTIMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button type="submit" className="admin-btn tags-btn--add" disabled={creating}>
          Ajouter
        </button>
      </form>

      {error && <p className="tags-error">{error}</p>}

      {loading ? (
        <p className="admin-empty">Chargement…</p>
      ) : tags.length === 0 ? (
        <p className="admin-empty">Aucun tag pour l'instant.</p>
      ) : (
        <ul className="admin-list">
          {tags.map(t => (
            <li key={t.id} className="admin-card tags-card">
              {editingId === t.id ? (
                <div className="tags-edit-row">
                  <input
                    className="tags-input tags-input--emoji"
                    value={editForm.emoji}
                    onChange={e => setEditForm(f => ({ ...f, emoji: e.target.value }))}
                    maxLength={10}
                  />
                  <input
                    className="tags-input tags-input--label"
                    value={editForm.label}
                    onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                    maxLength={100}
                  />
                  <select
                    className="tags-select"
                    value={editForm.sentiment}
                    onChange={e => setEditForm(f => ({ ...f, sentiment: e.target.value }))}
                  >
                    {SENTIMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <div className="tags-card-actions">
                    <button className="admin-btn admin-btn--restore" onClick={() => handleSaveEdit(t.id)}>
                      Enregistrer
                    </button>
                    <button className="admin-btn" onClick={() => setEditingId(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="tags-card-row">
                  <span className={`tags-badge tags-badge--${t.sentiment}`}>
                    {t.emoji} {t.label}
                  </span>
                  <span className="admin-card-meta">{t.usage_count} utilisation{t.usage_count > 1 ? 's' : ''}</span>
                  <div className="tags-card-actions">
                    <button className="admin-btn admin-btn--restore" onClick={() => startEdit(t)}>
                      Modifier
                    </button>
                    <button className="admin-btn admin-btn--remove" onClick={() => handleDelete(t.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
