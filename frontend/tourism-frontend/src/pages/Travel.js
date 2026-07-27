import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/Travel.css';
import { useMonumentImages } from '../hooks/useMonumentImages';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API = API_URL;

const STATUS_META = {
  planned:   { label: 'Planifié',  color: '#5c8a5c' },
  ongoing:   { label: 'En cours',  color: '#a8b826' },
  completed: { label: 'Terminé',   color: '#8b8b7a' },
};

// ── Groupement par jour ──────────────────────────────────────────────────────
// Les conteneurs de jour sont préfixés ("day:1", "day:none", "day:flat") pour ne
// jamais entrer en collision avec un monument_id (entier) utilisé comme id de
// carte déplaçable dans dnd-kit.
function buildGroups(trip) {
  if (!trip.use_days) {
    return { 'day:flat': [...trip.monuments].sort((a, b) => a.order - b.order) };
  }
  const n = trip.day_count || 1;
  const groups = {};
  for (let d = 1; d <= n; d++) groups[`day:${d}`] = [];
  groups['day:none'] = [];
  const sorted = [...trip.monuments].sort((a, b) => a.order - b.order);
  for (const m of sorted) {
    const key = m.day != null && m.day >= 1 && m.day <= n ? `day:${m.day}` : 'day:none';
    groups[key].push(m);
  }
  return groups;
}

function flattenGroups(groups, useDays, dayCount) {
  let out = [];
  if (!useDays) {
    out = (groups['day:flat'] || []).map(m => ({ ...m, day: null }));
  } else {
    for (let d = 1; d <= dayCount; d++) {
      out.push(...(groups[`day:${d}`] || []).map(m => ({ ...m, day: d })));
    }
    out.push(...(groups['day:none'] || []).map(m => ({ ...m, day: null })));
  }
  return out.map((m, idx) => ({ ...m, order: idx }));
}

function findContainer(id, groups) {
  if (typeof id === 'string' && id.startsWith('day:') && id in groups) return id;
  return Object.keys(groups).find(key => groups[key].some(m => m.monument_id === id));
}

// Calcule les traits de la timeline reliant deux monuments visités consécutifs,
// avec une petite animation qui part du monument qu'on vient de cocher.
function computeLineProps(items, i, justToggled) {
  const total = items.length;
  const prev = items[i - 1];
  const next = items[i + 1];
  const m = items[i];
  const HALF = 0.25;

  const topConnected = i > 0 && prev.is_visited && m.is_visited;
  let topAnimate = false, topOrigin = 'top', topDelay = 0;
  if (topConnected) {
    if (justToggled === m.monument_id) { topAnimate = true; topOrigin = 'bottom'; topDelay = 0; }
    else if (justToggled === prev?.monument_id) { topAnimate = true; topOrigin = 'top'; topDelay = HALF; }
  }

  const bottomConnected = i < total - 1 && m.is_visited && next.is_visited;
  let bottomAnimate = false, bottomOrigin = 'top', bottomDelay = 0;
  if (bottomConnected) {
    if (justToggled === m.monument_id) { bottomAnimate = true; bottomOrigin = 'top'; bottomDelay = 0; }
    else if (justToggled === next?.monument_id) { bottomAnimate = true; bottomOrigin = 'bottom'; bottomDelay = HALF; }
  }

  return {
    topConnected, topAnimate, topOrigin, topDelay,
    bottomConnected, bottomAnimate, bottomOrigin, bottomDelay,
    isFirst: i === 0, isLast: i === total - 1,
  };
}

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

function SortableMonumentItem({ m, lineProps, onToggleVisited, onRemove, removingId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.monument_id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  const {
    topConnected, topAnimate, topOrigin, topDelay,
    bottomConnected, bottomAnimate, bottomOrigin, bottomDelay,
    isFirst, isLast,
  } = lineProps;

  return (
    <div className="trip-timeline-row" ref={setNodeRef} style={style}>
      <div className="trip-timeline-track">
        <span
          key={`top-${topConnected}-${topAnimate ? 'anim' : 'static'}`}
          className={[
            'trip-timeline-line',
            isFirst ? 'trip-timeline-line--hidden' : '',
            topConnected ? 'trip-timeline-line--connected' : '',
            topAnimate ? `trip-timeline-line--animate trip-timeline-line--origin-${topOrigin}` : '',
          ].filter(Boolean).join(' ')}
          style={topAnimate ? { animationDelay: `${topDelay}s` } : undefined}
        />
        <button
          className={`trip-node${m.is_visited ? ' trip-node--done' : ''}`}
          onClick={onToggleVisited}
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
            isLast ? 'trip-timeline-line--hidden' : '',
            bottomConnected ? 'trip-timeline-line--connected' : '',
            bottomAnimate ? `trip-timeline-line--animate trip-timeline-line--origin-${bottomOrigin}` : '',
          ].filter(Boolean).join(' ')}
          style={bottomAnimate ? { animationDelay: `${bottomDelay}s` } : undefined}
        />
      </div>

      <div
        className={`trip-monument-card${m.is_visited ? ' trip-monument-card--visited' : ''}`}
        {...attributes}
        {...listeners}
      >
        <TripMonumentThumb monument={{ id: m.monument_id, name: m.name, latitude: m.latitude, longitude: m.longitude }} />
        <div className="trip-monument-info">
          <span className="trip-monument-name">{m.name}</span>
          {m.city && <span className="trip-monument-city">{m.city}</span>}
        </div>
        <svg className="trip-drag-grip" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
          <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
          <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
        </svg>
        <button
          className="trip-remove-btn"
          onClick={onRemove}
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
}

function DayGroup({ id, label, items, justToggled, onToggleVisited, onRemove, removingId }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="trip-day-group">
      {label && <div className="trip-day-label">{label}</div>}
      <SortableContext items={items.map(m => m.monument_id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={[
            'trip-timeline',
            isOver ? 'trip-timeline--over' : '',
            items.length === 0 ? 'trip-timeline--empty' : '',
          ].filter(Boolean).join(' ')}
        >
          {items.length === 0 ? (
            <div className="trip-day-empty">Glissez un monument ici</div>
          ) : items.map((m, i) => (
            <SortableMonumentItem
              key={m.monument_id}
              m={m}
              lineProps={computeLineProps(items, i, justToggled)}
              onToggleVisited={() => onToggleVisited(m)}
              onRemove={() => onRemove(m.monument_id)}
              removingId={removingId}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function TripCard({ trip, onRemoveMonument, onDeleteTrip, onToggleVisited, justToggled, onReorderMonuments, onPersistOrder, onUpdateSettings }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const total = trip.monuments.length;
  const visited = trip.monuments.filter(m => m.is_visited).length;
  const progressPct = total > 0 ? (visited / total) * 100 : 0;
  const computedStatus = visited === 0 ? 'planned' : visited === total ? 'completed' : 'ongoing';
  const meta = STATUS_META[computedStatus];
  const dayCount = trip.day_count || 1;

  const [groups, setGroups] = useState(() => buildGroups(trip));
  const monumentsSignature = useMemo(
    () => trip.monuments.map(m => `${m.monument_id}:${m.order}:${m.day}:${m.is_visited}`).join('|'),
    [trip.monuments]
  );
  useEffect(() => {
    setGroups(buildGroups(trip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.use_days, trip.day_count, monumentsSignature]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragOver(event) {
    const { active, over } = event;
    if (!over) return;
    setGroups(prev => {
      const activeContainer = findContainer(active.id, prev);
      const overContainer = findContainer(over.id, prev);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex(m => m.monument_id === active.id);
      if (activeIndex === -1) return prev;
      const movingItem = activeItems[activeIndex];
      const overIndex = overItems.findIndex(m => m.monument_id === over.id);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((_, idx) => idx !== activeIndex),
        [overContainer]: [...overItems.slice(0, newIndex), movingItem, ...overItems.slice(newIndex)],
      };
    });
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    setGroups(prev => {
      const activeContainer = findContainer(active.id, prev);
      const overContainer = findContainer(over.id, prev);
      let next = prev;
      if (activeContainer && overContainer && activeContainer === overContainer) {
        const items = prev[activeContainer];
        const oldIndex = items.findIndex(m => m.monument_id === active.id);
        const newIndex = items.findIndex(m => m.monument_id === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          next = { ...prev, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
        }
      }
      const flat = flattenGroups(next, trip.use_days, dayCount);
      onReorderMonuments(trip.id, flat);
      onPersistOrder(trip.id, flat);
      return next;
    });
  }

  const activeItem = activeId != null
    ? Object.values(groups).flat().find(m => m.monument_id === activeId)
    : null;

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
          <div className="trip-settings-row">
            <button className="trip-settings-btn" onClick={() => setEditingSettings(o => !o)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              Modifier
            </button>
          </div>

          {editingSettings && (
            <div className="trip-settings-panel">
              <label className="trip-settings-toggle">
                <input
                  type="checkbox"
                  checked={trip.use_days}
                  onChange={e => onUpdateSettings(trip.id, {
                    use_days: e.target.checked,
                    day_count: e.target.checked && !trip.day_count ? 1 : trip.day_count,
                  })}
                />
                Organiser par jours
              </label>
              {trip.use_days && (
                <div className="trip-settings-daycount">
                  <span>Nombre de jours</span>
                  <div className="trip-daycount-stepper">
                    <button
                      onClick={() => onUpdateSettings(trip.id, { day_count: Math.max(1, dayCount - 1) })}
                      disabled={dayCount <= 1}
                      aria-label="Retirer un jour"
                    >−</button>
                    <span>{dayCount}</span>
                    <button
                      onClick={() => onUpdateSettings(trip.id, { day_count: Math.min(30, dayCount + 1) })}
                      disabled={dayCount >= 30}
                      aria-label="Ajouter un jour"
                    >+</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {total === 0 ? (
            <p className="trip-empty">Aucun monument ajouté à ce trajet.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {trip.use_days ? (
                <>
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map(d => (
                    <DayGroup
                      key={`day:${d}`}
                      id={`day:${d}`}
                      label={`Jour ${d}`}
                      items={groups[`day:${d}`] || []}
                      justToggled={justToggled}
                      onToggleVisited={m => onToggleVisited(trip.id, m)}
                      onRemove={handleRemoveMonument}
                      removingId={removingId}
                    />
                  ))}
                  <DayGroup
                    id="day:none"
                    label="Non planifié"
                    items={groups['day:none'] || []}
                    justToggled={justToggled}
                    onToggleVisited={m => onToggleVisited(trip.id, m)}
                    onRemove={handleRemoveMonument}
                    removingId={removingId}
                  />
                </>
              ) : (
                <DayGroup
                  id="day:flat"
                  label={null}
                  items={groups['day:flat'] || []}
                  justToggled={justToggled}
                  onToggleVisited={m => onToggleVisited(trip.id, m)}
                  onRemove={handleRemoveMonument}
                  removingId={removingId}
                />
              )}
              <DragOverlay>
                {activeItem ? (
                  <div className="trip-monument-card trip-monument-card--dragging">
                    <TripMonumentThumb monument={{ id: activeItem.monument_id, name: activeItem.name, latitude: activeItem.latitude, longitude: activeItem.longitude }} />
                    <div className="trip-monument-info">
                      <span className="trip-monument-name">{activeItem.name}</span>
                      {activeItem.city && <span className="trip-monument-city">{activeItem.city}</span>}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {total > 0 && (
            <button
              className="trip-map-btn"
              onClick={() => navigate('/map', { state: { trip } })}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
              </svg>
              Voir sur la carte
            </button>
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

  function reorderMonumentsLocal(tripId, monuments) {
    setTrips(prev => prev.map(t => t.id !== tripId ? t : { ...t, monuments }));
  }

  async function persistOrder(tripId, monuments) {
    const items = monuments.map(m => ({ monument_id: m.monument_id, order: m.order, day: m.day ?? null }));
    try {
      const r = await fetch(`${API}/trips/${tripId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error();
    } catch {
      fetchTrips();
    }
  }

  async function updateTripSettings(tripId, settings) {
    setTrips(prev => prev.map(t => t.id !== tripId ? t : { ...t, ...settings }));
    try {
      const r = await fetch(`${API}/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
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
              onReorderMonuments={reorderMonumentsLocal}
              onPersistOrder={persistOrder}
              onUpdateSettings={updateTripSettings}
            />
          ))}
        </div>
      )}
    </div>
  );
}
