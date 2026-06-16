import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/AddToTripDialog.css';

const API = API_URL;

export default function AddToTripDialog({ monument, onClose }) {
  const { user, token } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [newTripName, setNewTripName] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/trips/user/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setTrips(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, token]);

  async function addToTrip(tripId) {
    setAdding(tripId);
    try {
      const r = await fetch(`${API}/trips/${tripId}/monuments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monument_id: monument.id }),
      });
      if (r.ok) {
        setFeedback({ type: 'success', message: 'Monument ajouté au trajet !' });
        setTimeout(onClose, 1100);
      } else {
        const err = await r.json().catch(() => ({}));
        setFeedback({ type: 'error', message: err.detail || 'Erreur lors de l\'ajout' });
        setAdding(null);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erreur réseau' });
      setAdding(null);
    }
  }

  async function createAndAdd() {
    if (!newTripName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user.id, name: newTripName.trim() }),
      });
      if (!r.ok) throw new Error();
      const newTrip = await r.json();
      await addToTrip(newTrip.id);
    } catch {
      setFeedback({ type: 'error', message: 'Erreur lors de la création du trajet' });
      setCreating(false);
    }
  }

  return (
    <>
      <div className="atd-backdrop" onClick={onClose} />
      <div className="atd-dialog" role="dialog" aria-modal="true">
        <div className="atd-header">
          <div className="atd-header-left">
            <svg className="atd-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
            </svg>
            <h3>Ajouter à un trajet</h3>
          </div>
          <button className="atd-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <p className="atd-monument-name">{monument.name}</p>

        {feedback && (
          <div className={`atd-feedback atd-feedback--${feedback.type}`}>
            {feedback.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            )}
            {feedback.message}
          </div>
        )}

        <div className="atd-section-label">Trajets existants</div>

        {loading ? (
          <div className="atd-loading">
            <div className="atd-spinner" />
            Chargement…
          </div>
        ) : trips.length === 0 ? (
          <p className="atd-empty">Aucun trajet pour l'instant.</p>
        ) : (
          <ul className="atd-trip-list">
            {trips.map(trip => (
              <li key={trip.id} className="atd-trip-item">
                <div className="atd-trip-info">
                  <span className="atd-trip-name">{trip.name}</span>
                  <span className="atd-trip-count">
                    {trip.monuments.length} monument{trip.monuments.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  className="atd-add-btn"
                  onClick={() => addToTrip(trip.id)}
                  disabled={adding !== null || creating}
                >
                  {adding === trip.id ? (
                    <div className="atd-btn-spinner" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                      </svg>
                      Ajouter
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="atd-separator"><span>ou créer un nouveau trajet</span></div>

        <div className="atd-create">
          <input
            className="atd-input"
            type="text"
            placeholder="Ex : Voyage à Rome, Week-end Lyon…"
            value={newTripName}
            onChange={e => setNewTripName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAndAdd()}
            disabled={creating || adding !== null}
          />
          <button
            className="atd-create-btn"
            onClick={createAndAdd}
            disabled={creating || adding !== null || !newTripName.trim()}
          >
            {creating ? <div className="atd-btn-spinner atd-btn-spinner--light" /> : 'Créer et ajouter'}
          </button>
        </div>
      </div>
    </>
  );
}
