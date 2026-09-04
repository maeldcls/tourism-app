import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminNav from '../components/AdminNav';
import ConfirmDialog from '../components/ConfirmDialog';
import { searchCities } from '../utils/citySearch';
import API_URL from '../config';
import '../css/AdminComments.css';
import '../css/AdminFeaturedDestinations.css';

const API = API_URL;
const CITY_DEBOUNCE_MS = 400;
const MONUMENT_DEBOUNCE_MS = 350;

const EMPTY_FORM = { name: '', country: '', lat: null, lon: null, tagline: '', isActive: true, coverFile: null };

function coverUrl(path) {
  return path?.startsWith('/') ? `${API}${path}` : path;
}

// ── Recherche de ville (Nominatim), réutilisée pour créer/éditer une destination ──
function CityPicker({ value, onSelect }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      searchCities(value.trim(), controller.signal)
        .then(data => { if (!controller.signal.aborted) { setResults(data); setOpen(true); } })
        .catch(() => { if (!controller.signal.aborted) { setResults([]); setOpen(true); } });
    }, CITY_DEBOUNCE_MS);
  }

  function pick(p) {
    const parts = p.display_name.split(',').map(s => s.trim());
    const name = parts[0];
    const country = parts[parts.length - 1];
    setQuery(name);
    setOpen(false);
    onSelect({ name, country, lat: parseFloat(p.lat), lon: parseFloat(p.lon) });
  }

  return (
    <div className="afd-city-picker" ref={boxRef}>
      <input
        className="afd-input"
        placeholder="Rechercher une ville…"
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="afd-city-results">
          {results.length === 0 && <div className="afd-city-status">Aucune ville trouvée</div>}
          {results.map(p => (
            <button key={p.place_id} type="button" className="afd-city-item" onClick={() => pick(p)}>
              {p.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recherche + ajout de monuments incontournables pour une destination ─────────
function MonumentPicker({ destination, token, onChanged }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);
  const existingIds = new Set(destination.monuments.map(m => m.id));

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      fetch(`${API}/monuments?q=${encodeURIComponent(value.trim())}`)
        .then(r => r.json())
        .then(data => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]));
    }, MONUMENT_DEBOUNCE_MS);
  }

  async function addMonument(monumentId) {
    try {
      const r = await fetch(`${API}/admin/featured-destinations/${destination.id}/monuments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monument_id: monumentId }),
      });
      if (!r.ok) throw new Error();
      setQuery('');
      setResults([]);
      onChanged();
    } catch {
      // laisse la recherche en place, l'admin peut réessayer
    }
  }

  async function removeMonument(monumentId) {
    try {
      const r = await fetch(`${API}/admin/featured-destinations/${destination.id}/monuments/${monumentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      onChanged();
    } catch {
      // laisse la liste en place
    }
  }

  return (
    <div className="afd-monuments">
      <p className="afd-monuments-label">Monuments incontournables</p>

      {destination.monuments.length === 0 ? (
        <p className="admin-empty">Aucun monument ajouté.</p>
      ) : (
        <ul className="afd-monument-list">
          {destination.monuments.map(m => (
            <li key={m.id} className="afd-monument-row">
              <span>{m.name}{m.city ? ` — ${m.city}` : ''}</span>
              <button className="admin-btn admin-btn--remove" onClick={() => removeMonument(m.id)}>Retirer</button>
            </li>
          ))}
        </ul>
      )}

      <input
        className="afd-input"
        placeholder="Rechercher un monument à ajouter…"
        value={query}
        onChange={handleChange}
      />
      {results.length > 0 && (
        <ul className="afd-monument-results">
          {results.filter(r => !existingIds.has(r.id)).map(r => (
            <li key={r.id}>
              <button type="button" className="afd-monument-result" onClick={() => addMonument(r.id)}>
                {r.name}{r.city ? ` — ${r.city}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminFeaturedDestinations() {
  const { user, token } = useAuth();

  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchDestinations = useCallback(() => {
    setLoading(true);
    fetch(`${API}/admin/featured-destinations`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setDestinations(Array.isArray(data) ? data : []))
      .catch(() => setDestinations([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (user?.is_admin) fetchDestinations(); }, [user, fetchDestinations]);

  function buildFormData(f) {
    const fd = new FormData();
    fd.append('name', f.name);
    if (f.country) fd.append('country', f.country);
    if (f.tagline) fd.append('tagline', f.tagline);
    if (f.lat != null) fd.append('latitude', f.lat);
    if (f.lon != null) fd.append('longitude', f.lon);
    fd.append('is_active', String(f.isActive));
    if (f.coverFile) fd.append('cover_image', f.coverFile);
    return fd;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch(`${API}/admin/featured-destinations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(form),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Erreur');
      setForm(EMPTY_FORM);
      fetchDestinations();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(d) {
    setEditingId(d.id);
    setEditForm({ name: d.name, country: d.country || '', lat: d.latitude, lon: d.longitude, tagline: d.tagline || '', isActive: d.is_active, coverFile: null });
  }

  async function handleSaveEdit(id) {
    setError(null);
    try {
      const r = await fetch(`${API}/admin/featured-destinations/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(editForm),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Erreur');
      setEditingId(null);
      fetchDestinations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleActive(d) {
    try {
      const fd = new FormData();
      fd.append('is_active', String(!d.is_active));
      const r = await fetch(`${API}/admin/featured-destinations/${d.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) throw new Error();
      fetchDestinations();
    } catch {
      // pas de rollback optimiste ici, l'admin peut réessayer
    }
  }

  async function handleDelete(id) {
    try {
      const r = await fetch(`${API}/admin/featured-destinations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setDestinations(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeleteTarget(null);
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
      <AdminNav />
      <h1 className="admin-title">Destinations en avant</h1>
      <p className="admin-subtitle">Villes mises en avant sur la page d'accueil, avec leurs monuments incontournables.</p>

      <form className="afd-create-form" onSubmit={handleCreate}>
        <CityPicker
          value={form.name}
          onSelect={({ name, country, lat, lon }) => setForm(f => ({ ...f, name, country, lat, lon }))}
        />
        <input
          className="afd-input"
          placeholder="Accroche (ex : Berceau de la démocratie occidentale)"
          value={form.tagline}
          onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
          maxLength={500}
        />
        <label className="afd-file-label">
          Photo de couverture
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setForm(f => ({ ...f, coverFile: e.target.files?.[0] || null }))} />
        </label>
        <label className="afd-toggle">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
          Active dès la création
        </label>
        <button type="submit" className="admin-btn afd-btn--add" disabled={creating || !form.name.trim()}>
          Ajouter la destination
        </button>
      </form>

      {error && <p className="tags-error">{error}</p>}

      {loading ? (
        <p className="admin-empty">Chargement…</p>
      ) : destinations.length === 0 ? (
        <p className="admin-empty">Aucune destination pour l'instant.</p>
      ) : (
        <ul className="admin-list">
          {destinations.map(d => (
            <li key={d.id} className="admin-card afd-card">
              {editingId === d.id ? (
                <div className="afd-edit-form">
                  <CityPicker
                    value={editForm.name}
                    onSelect={({ name, country, lat, lon }) => setEditForm(f => ({ ...f, name, country, lat, lon }))}
                  />
                  <input
                    className="afd-input"
                    value={editForm.tagline}
                    onChange={e => setEditForm(f => ({ ...f, tagline: e.target.value }))}
                    maxLength={500}
                  />
                  <label className="afd-file-label">
                    Nouvelle photo (optionnel)
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setEditForm(f => ({ ...f, coverFile: e.target.files?.[0] || null }))} />
                  </label>
                  <div className="afd-card-actions">
                    <button className="admin-btn admin-btn--restore" onClick={() => handleSaveEdit(d.id)}>Enregistrer</button>
                    <button className="admin-btn" onClick={() => setEditingId(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="afd-card-head">
                    {d.cover_image_url && <img className="afd-cover-thumb" src={coverUrl(d.cover_image_url)} alt="" />}
                    <div className="afd-card-info">
                      <span className="admin-card-monument">{d.name}{d.country ? `, ${d.country}` : ''}</span>
                      {d.tagline && <span className="admin-card-meta">{d.tagline}</span>}
                      <span className={`afd-status-badge ${d.is_active ? 'afd-status-badge--active' : ''}`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="afd-card-actions">
                    <button className="admin-btn admin-btn--restore" onClick={() => handleToggleActive(d)}>
                      {d.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                    <button className="admin-btn" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                      {expandedId === d.id ? 'Fermer' : `Monuments (${d.monuments.length})`}
                    </button>
                    <button className="admin-btn" onClick={() => startEdit(d)}>Modifier</button>
                    <button className="admin-btn admin-btn--remove" onClick={() => setDeleteTarget(d)}>Supprimer</button>
                  </div>

                  {expandedId === d.id && (
                    <MonumentPicker destination={d} token={token} onChanged={fetchDestinations} />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer cette destination ?"
        message={deleteTarget ? `"${deleteTarget.name}" ne sera plus visible sur la page d'accueil.` : ''}
        onConfirm={() => handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
