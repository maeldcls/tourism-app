import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/Travel.css';

const API = API_URL;

const STATUS_META = {
  planned:   { label: 'Planifié',  color: '#3b82f6' },
  ongoing:   { label: 'En cours',  color: '#16a34a' },
  completed: { label: 'Terminé',   color: '#6b7280' },
};

function TripCard({ trip, onRemoveMonument, onDeleteTrip }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const meta = STATUS_META[trip.status] ?? STATUS_META.planned;
  const visited = trip.monuments.filter(m => m.is_visited).length;

  async function handleRemoveMonument(monumentId) {
    setRemovingId(monumentId);
    await onRemoveMonument(trip.id, monumentId);
    setRemovingId(null);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDeleteTrip(trip.id);
  }

  return (
    <div className={`trip-card ${open ? 'trip-card--open' : ''}`}>
      <button className="trip-card-header" onClick={() => setOpen(o => !o)}>
        <div className="trip-card-header-left">
          <div className="trip-status-dot" style={{ background: meta.color }} />
          <div className="trip-card-info">
            <span className="trip-name">{trip.name}</span>
            <span className="trip-meta">
              <span className="trip-badge" style={{ background: meta.color + '22', color: meta.color }}>
                {meta.label}
              </span>
              <span className="trip-count">{trip.monuments.length} monument{trip.monuments.length !== 1 ? 's' : ''}</span>
              {trip.monuments.length > 0 && (
                <span className="trip-progress">{visited}/{trip.monuments.length} visités</span>
              )}
            </span>
          </div>
        </div>
        <svg
          className={`trip-chevron ${open ? 'trip-chevron--open' : ''}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
      </button>

      {open && (
        <div className="trip-body">
          {trip.monuments.length === 0 ? (
            <p className="trip-empty">Aucun monument ajouté à ce trajet.</p>
          ) : (
            <ul className="trip-monuments">
              {trip.monuments.map(m => (
                <li key={m.monument_id} className={`trip-monument-item ${m.is_visited ? 'trip-monument-item--visited' : ''}`}>
                  <div className="trip-monument-left">
                    <div className={`trip-visit-dot ${m.is_visited ? 'trip-visit-dot--done' : ''}`} />
                    <div className="trip-monument-info">
                      <span className="trip-monument-name">{m.name}</span>
                      {m.city && <span className="trip-monument-city">{m.city}</span>}
                    </div>
                  </div>
                  <button
                    className="trip-remove-btn"
                    onClick={() => handleRemoveMonument(m.monument_id)}
                    disabled={removingId === m.monument_id}
                    aria-label={`Retirer ${m.name}`}
                  >
                    {removingId === m.monument_id ? (
                      <div className="trip-mini-spinner" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {trip.monuments.length > 0 && (
            <div className="trip-progress-bar-wrap">
              <div
                className="trip-progress-bar-fill"
                style={{ width: `${(visited / trip.monuments.length) * 100}%` }}
              />
            </div>
          )}

          <button
            className="trip-delete-btn"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <div className="trip-mini-spinner trip-mini-spinner--red" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
                Supprimer ce trajet
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Travel() {
  const { user, token } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTrips = useCallback(() => {
    if (!user) return;
    fetch(`${API}/trips/user/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setTrips(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, token]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  async function createTrip() {
    if (!newTripName.trim()) return;
    setCreating(true);
    await fetch(`${API}/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: user.id, name: newTripName.trim() }),
    });
    setNewTripName('');
    setShowCreate(false);
    setCreating(false);
    fetchTrips();
  }

  async function removeMonument(tripId, monumentId) {
    await fetch(`${API}/trips/${tripId}/monuments/${monumentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchTrips();
  }

  async function deleteTrip(tripId) {
    await fetch(`${API}/trips/${tripId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchTrips();
  }

  return (
    <div className="travel-page">
      <div className="travel-header">
        <div>
          <h1 className="travel-title">Mes voyages</h1>
          <p className="travel-subtitle">
            {trips.length === 0 ? 'Aucun trajet pour l\'instant' : `${trips.length} trajet${trips.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="travel-new-btn" onClick={() => setShowCreate(s => !s)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Nouveau
        </button>
      </div>

      {showCreate && (
        <div className="travel-create-panel">
          <input
            className="travel-create-input"
            type="text"
            placeholder="Nom du trajet (ex: Vacances Italie)"
            value={newTripName}
            onChange={e => setNewTripName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTrip()}
            autoFocus
          />
          <div className="travel-create-actions">
            <button
              className="travel-create-confirm"
              onClick={createTrip}
              disabled={creating || !newTripName.trim()}
            >
              {creating ? <div className="trip-mini-spinner trip-mini-spinner--light" /> : 'Créer'}
            </button>
            <button
              className="travel-create-cancel"
              onClick={() => { setShowCreate(false); setNewTripName(''); }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="travel-loading">
          <div className="travel-spinner" />
          <span>Chargement des trajets…</span>
        </div>
      ) : trips.length === 0 ? (
        <div className="travel-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
          </svg>
          <p>Aucun trajet créé.</p>
          <span>Ajoutez des monuments depuis la carte pour commencer.</span>
        </div>
      ) : (
        <div className="travel-list">
          {trips.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              onRemoveMonument={removeMonument}
              onDeleteTrip={deleteTrip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
