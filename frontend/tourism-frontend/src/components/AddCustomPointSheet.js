import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import IconColorPicker from './IconColorPicker';
import '../css/AddCustomPointSheet.css';

const API = API_URL;

export default function AddCustomPointSheet({ position, onClose, onCreated, defaultTripId }) {
  const { user, token } = useAuth();
  const [name, setName]         = useState('');
  const [icon, setIcon]         = useState('pin');
  const [color, setColor]       = useState(null); // null = couleur par défaut de l'icône
  const [tripId, setTripId]     = useState(defaultTripId != null ? String(defaultTripId) : '');
  const [trips, setTrips]       = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/trips/user/${user.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setTrips(Array.isArray(data) ? data : []); setLoadingTrips(false); })
      .catch(() => setLoadingTrips(false));
  }, [user, token]);

  if (!position) return null;

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API}/custom-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          latitude: position.lat,
          longitude: position.lng,
          icon,
          color,
          trip_id: tripId ? Number(tripId) : null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de la création du point');
      }
      const point = await r.json();
      onCreated(point);
    } catch (e) {
      setError(e.message || 'Erreur réseau');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="acp-backdrop" onClick={onClose} />
      <div className="acp-dialog" role="dialog" aria-modal="true">
        <div className="acp-header">
          <h3>Nouveau point</h3>
          <button className="acp-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="acp-coords">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</div>

        {error && <div className="acp-error">{error}</div>}

        <input
          className="acp-input"
          type="text"
          placeholder="Nom du point"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <IconColorPicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />

        <div className="acp-section-label">Trajet</div>
        <select
          className="acp-select"
          value={tripId}
          onChange={e => setTripId(e.target.value)}
          disabled={loadingTrips}
        >
          <option value="">Non attribué</option>
          {trips.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <button className="acp-save-btn" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? <div className="acp-spinner" /> : 'Ajouter le point'}
        </button>
      </div>
    </>
  );
}
