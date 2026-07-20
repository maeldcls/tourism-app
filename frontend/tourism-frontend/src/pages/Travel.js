import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/Travel.css';
import { useMonumentImages } from '../hooks/useMonumentImages';

const API = API_URL;

const STATUS_META = {
  planned:   { label: 'Planifié',  color: '#5c8a5c' },
  ongoing:   { label: 'En cours',  color: '#a8b826' },
  completed: { label: 'Terminé',   color: '#8b8b7a' },
};

function TripMonumentThumb({ monument }) {
  const { images, loading } = useMonumentImages(monument);

  if (loading) return <div className="trip-thumb trip-thumb--skeleton" />;

  if (!images.length) {
    return (
      <div className="trip-thumb trip-thumb--placeholder">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="trip-thumb">
      <img src={images[0]} alt="" onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function TripCard({ trip, onRemoveMonument, onDeleteTrip, onToggleVisited, justToggled }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const total = trip.monuments.length;
  const visited = trip.monuments.filter(m => m.is_visited).length;
  const progressPct = total > 0 ? (visited / total) * 100 : 0;
  const computedStatus = visited === 0 ? 'planned' : visited === total ? 'completed' : 'ongoing';
  const meta = STATUS_META[computedStatus];

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
      <button className="trip-pill" onClick={() => setOpen(o => !o)}>
        <span className="trip-pill-name">{trip.name}</span>
        {total > 0 && (
          <span className="trip-pill-progress">
            <span className="trip-pill-progress-fill" style={{ width: `${progressPct}%` }} />
          </span>
        )}
        <svg
          className={`trip-chevron ${open ? 'trip-chevron--open' : ''}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
      </button>

      <div className="trip-pill-meta">
        <span className="trip-badge" style={{ background: meta.color + '22', color: meta.color }}>
          {meta.label}
        </span>
        <span className="trip-count">{total} monument{total !== 1 ? 's' : ''}</span>
        {total > 0 && <span className="trip-progress-label">{visited}/{total} visités</span>}
      </div>

      {open && (
        <div className="trip-body">
          {total === 0 ? (
            <p className="trip-empty">Aucun monument ajouté à ce trajet.</p>
          ) : (
            <div className="trip-timeline">
              {trip.monuments.map((m, i) => {
                const prev = trip.monuments[i - 1];
                const next = trip.monuments[i + 1];

                // Un trait vert entre deux nœuds est dessiné en 2 moitiés (une par ligne),
                // qui se rejoignent au milieu. Pour donner l'impression d'un seul trait continu
                // qui part du monument qu'on vient de valider, la moitié la plus proche de ce
                // monument s'anime en premier (delay 0), puis la moitié la plus éloignée prend
                // le relais exactement là où la première s'arrête (delay = HALF) — comme une
                // barre de progression qui avance en continu, pas deux bouts qui poussent chacun de leur côté.
                const HALF = 0.25;

                const topConnected = i > 0 && prev.is_visited && m.is_visited;
                let topAnimate = false, topOrigin = 'top', topDelay = 0;
                if (topConnected) {
                  if (justToggled === m.monument_id) {
                    topAnimate = true; topOrigin = 'bottom'; topDelay = 0;
                  } else if (justToggled === prev?.monument_id) {
                    topAnimate = true; topOrigin = 'top'; topDelay = HALF;
                  }
                }

                const bottomConnected = i < total - 1 && m.is_visited && next.is_visited;
                let bottomAnimate = false, bottomOrigin = 'top', bottomDelay = 0;
                if (bottomConnected) {
                  if (justToggled === m.monument_id) {
                    bottomAnimate = true; bottomOrigin = 'top'; bottomDelay = 0;
                  } else if (justToggled === next?.monument_id) {
                    bottomAnimate = true; bottomOrigin = 'bottom'; bottomDelay = HALF;
                  }
                }

                return (
                <div key={m.monument_id} className="trip-timeline-row">
                  <div className="trip-timeline-track">
                    <span
                      key={`top-${topConnected}-${topAnimate ? 'anim' : 'static'}`}
                      className={[
                        'trip-timeline-line',
                        i === 0 ? 'trip-timeline-line--hidden' : '',
                        topConnected ? 'trip-timeline-line--connected' : '',
                        topAnimate ? `trip-timeline-line--animate trip-timeline-line--origin-${topOrigin}` : '',
                      ].filter(Boolean).join(' ')}
                      style={topAnimate ? { animationDelay: `${topDelay}s` } : undefined}
                    />
                    <button
                      className={`trip-node${m.is_visited ? ' trip-node--done' : ''}`}
                      onClick={() => onToggleVisited(trip.id, m)}
                      aria-label={m.is_visited ? `Marquer ${m.name} comme non visité` : `Marquer ${m.name} comme visité`}
                    >
                      {m.is_visited && (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      )}
                    </button>
                    <span
                      key={`bottom-${bottomConnected}-${bottomAnimate ? 'anim' : 'static'}`}
                      className={[
                        'trip-timeline-line',
                        i === total - 1 ? 'trip-timeline-line--hidden' : '',
                        bottomConnected ? 'trip-timeline-line--connected' : '',
                        bottomAnimate ? `trip-timeline-line--animate trip-timeline-line--origin-${bottomOrigin}` : '',
                      ].filter(Boolean).join(' ')}
                      style={bottomAnimate ? { animationDelay: `${bottomDelay}s` } : undefined}
                    />
                  </div>

                  <div className={`trip-monument-card${m.is_visited ? ' trip-monument-card--visited' : ''}`}>
                    <TripMonumentThumb monument={{ id: m.monument_id, name: m.name, latitude: m.latitude, longitude: m.longitude }} />
                    <div className="trip-monument-info">
                      <span className="trip-monument-name">{m.name}</span>
                      {m.city && <span className="trip-monument-city">{m.city}</span>}
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
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                );
              })}
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
  const [justToggled, setJustToggled] = useState(null);

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

  async function toggleVisited(tripId, monument) {
    const nextVisited = !monument.is_visited;
    setTrips(prev => prev.map(t => t.id !== tripId ? t : {
      ...t,
      monuments: t.monuments.map(m => m.monument_id === monument.monument_id ? { ...m, is_visited: nextVisited } : m),
    }));
    if (nextVisited) {
      setJustToggled(monument.monument_id);
      setTimeout(() => {
        setJustToggled(id => id === monument.monument_id ? null : id);
      }, 550);
    }
    try {
      const r = await fetch(`${API}/trips/${tripId}/monuments/${monument.monument_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_visited: nextVisited }),
      });
      if (!r.ok) throw new Error();
    } catch {
      fetchTrips();
    }
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
              onToggleVisited={toggleVisited}
              justToggled={justToggled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
