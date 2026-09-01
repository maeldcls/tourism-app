import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import API_URL from '../config';
import '../css/Travel.css';
import { useMonumentImages } from '../hooks/useMonumentImages';
import MonumentIconEditor from '../components/MonumentIconEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import ShareTripSheet from '../components/ShareTripSheet';
import { ICON_LIBRARY } from '../utils/pointIcons';
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
  planned:   { label: 'Planifié',  color: '#348aa7' },
  ongoing:   { label: 'En cours',  color: '#5dd39e' },
  completed: { label: 'Terminé',   color: '#513b56' },
};

// ── Fusion monuments + points custom en une seule liste d'items de timeline ──
// Chaque item porte un `itemId` string unique ("m:12" / "c:7") utilisé comme id
// dnd-kit, et un `kind` ('monument' | 'custom') pour brancher le bon comportement
// (suppression, édition, navigation) à chaque endroit où l'item est manipulé.
function normalizeItems(trip) {
  const monuments = (trip.monuments || []).map(m => ({
    ...m,
    kind: 'monument',
    itemId: `m:${m.monument_id}`,
  }));
  const customPoints = (trip.custom_points || []).map(p => ({
    ...p,
    kind: 'custom',
    itemId: `c:${p.custom_point_id}`,
    city: null,
  }));
  return [...monuments, ...customPoints];
}

// ── Groupement par jour ──────────────────────────────────────────────────────
// Les conteneurs de jour sont préfixés ("day:1", "day:none", "day:flat") pour ne
// jamais entrer en collision avec un itemId utilisé comme id de carte déplaçable
// dans dnd-kit.
function buildGroups(trip) {
  const items = normalizeItems(trip);
  if (!trip.use_days) {
    return { 'day:flat': items.sort((a, b) => a.order - b.order) };
  }
  const n = trip.day_count || 1;
  const groups = {};
  for (let d = 1; d <= n; d++) groups[`day:${d}`] = [];
  groups['day:none'] = [];
  const sorted = [...items].sort((a, b) => a.order - b.order);
  for (const it of sorted) {
    const key = it.day != null && it.day >= 1 && it.day <= n ? `day:${it.day}` : 'day:none';
    groups[key].push(it);
  }
  return groups;
}

function flattenGroups(groups, useDays, dayCount) {
  let out = [];
  if (!useDays) {
    out = (groups['day:flat'] || []).map(it => ({ ...it, day: null }));
  } else {
    for (let d = 1; d <= dayCount; d++) {
      out.push(...(groups[`day:${d}`] || []).map(it => ({ ...it, day: d })));
    }
    out.push(...(groups['day:none'] || []).map(it => ({ ...it, day: null })));
  }
  return out.map((it, idx) => ({ ...it, order: idx }));
}

function findContainer(id, groups) {
  if (typeof id === 'string' && id.startsWith('day:') && id in groups) return id;
  return Object.keys(groups).find(key => groups[key].some(it => it.itemId === id));
}

// Calcule les traits de la timeline reliant deux éléments visités consécutifs,
// avec une petite animation qui part de l'élément qu'on vient de cocher.
function computeLineProps(items, i, justToggled) {
  const total = items.length;
  const prev = items[i - 1];
  const next = items[i + 1];
  const it = items[i];
  const HALF = 0.25;

  const topConnected = i > 0 && prev.is_visited && it.is_visited;
  let topAnimate = false, topOrigin = 'top', topDelay = 0;
  if (topConnected) {
    if (justToggled === it.itemId) { topAnimate = true; topOrigin = 'bottom'; topDelay = 0; }
    else if (justToggled === prev?.itemId) { topAnimate = true; topOrigin = 'top'; topDelay = HALF; }
  }

  const bottomConnected = i < total - 1 && it.is_visited && next.is_visited;
  let bottomAnimate = false, bottomOrigin = 'top', bottomDelay = 0;
  if (bottomConnected) {
    if (justToggled === it.itemId) { bottomAnimate = true; bottomOrigin = 'top'; bottomDelay = 0; }
    else if (justToggled === next?.itemId) { bottomAnimate = true; bottomOrigin = 'bottom'; bottomDelay = HALF; }
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

function TripCustomPointThumb({ icon, color }) {
  const def = ICON_LIBRARY[icon] || ICON_LIBRARY.pin;
  const fill = color || def.color;
  return (
    <div className="trip-thumb trip-thumb--point" style={{ background: fill }}>
      {def.glyph ? (
        <svg viewBox="0 0 24 24" fill="#fff" width="22" height="22" dangerouslySetInnerHTML={{ __html: def.glyph }} />
      ) : (
        <span className="trip-thumb-dot" />
      )}
    </div>
  );
}

function SortableTimelineItem({ item, lineProps, onToggleVisited, onRemove, removingId, onUpdateIcon, onViewDetail, canEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.itemId, disabled: !canEdit });
  const [editingIcon, setEditingIcon] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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

  const isCustom = item.kind === 'custom';

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
          className={`trip-node${item.is_visited ? ' trip-node--done' : ''}`}
          onClick={onToggleVisited}
          disabled={!canEdit}
          aria-label={item.is_visited ? `Marquer ${item.name} comme non visité` : `Marquer ${item.name} comme visité`}
        >
          {item.is_visited && (
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
        className={`trip-monument-card${item.is_visited ? ' trip-monument-card--visited' : ''}`}
        {...(canEdit ? attributes : {})}
        {...(canEdit ? listeners : {})}
      >
        {isCustom ? (
          <TripCustomPointThumb icon={item.icon} color={item.color} />
        ) : (
          <TripMonumentThumb monument={{ id: item.monument_id, name: item.name, latitude: item.latitude, longitude: item.longitude }} />
        )}
        <div className="trip-monument-info">
          <span className="trip-monument-name">{item.name}</span>
          {isCustom ? (
            <span className="trip-monument-city">Point personnalisé</span>
          ) : (
            item.city && <span className="trip-monument-city">{item.city}</span>
          )}
        </div>
        {!isCustom && (
          <button
            className="trip-action-btn"
            onClick={() => onViewDetail(item)}
            aria-label={`Voir la page de ${item.name}`}
            title="Voir la page du monument"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </button>
        )}
        {canEdit && (
          <button
            className="trip-action-btn"
            onClick={() => setEditingIcon(true)}
            aria-label={`Personnaliser l'icône de ${item.name}`}
            title="Personnaliser l'icône"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M12 3C7.03 3 2 6.13 2 11.5 2 15.09 4.13 17 6.5 17c.8 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.4-1.01-.25-.27-.4-.62-.4-1.01 0-.83.67-1.5 1.5-1.5H11c3.31 0 6-2.69 6-6 0-1.71-.72-3-2-3.5C15.87 3.34 14.5 3 12 3zm-5.5 8.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM9 8c-.83 0-1.5-.67-1.5-1.5S8.17 5 9 5s1.5.67 1.5 1.5S9.83 8 9 8zm4 0c-.83 0-1.5-.67-1.5-1.5S12.17 5 13 5s1.5.67 1.5 1.5S13.83 8 13 8zm3 3c-.83 0-1.5-.67-1.5-1.5S15.17 8 16 8s1.5.67 1.5 1.5S16.83 11 16 11z" />
            </svg>
          </button>
        )}
        {canEdit && (
          <svg className="trip-drag-grip" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
            <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
            <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
          </svg>
        )}
        {canEdit && (
          <button
            className="trip-remove-btn"
            onClick={() => setConfirmingRemove(true)}
            disabled={removingId === item.itemId}
            aria-label={isCustom ? `Supprimer ${item.name}` : `Retirer ${item.name}`}
          >
            {removingId === item.itemId ? (
              <div className="trip-mini-spinner" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {editingIcon && (
        <MonumentIconEditor
          name={item.name}
          icon={item.icon}
          color={item.color}
          onSave={(icon, color) => onUpdateIcon(icon, color)}
          onClose={() => setEditingIcon(false)}
        />
      )}

      <ConfirmDialog
        open={confirmingRemove}
        title={isCustom ? `Supprimer ${item.name} ?` : `Retirer ${item.name} ?`}
        message={isCustom
          ? 'Ce point personnalisé sera définitivement supprimé.'
          : 'Ce monument sera retiré de ce trajet (vous pourrez le rajouter plus tard).'}
        confirmLabel={isCustom ? 'Supprimer' : 'Retirer'}
        onConfirm={async () => { setConfirmingRemove(false); onRemove(); }}
        onCancel={() => setConfirmingRemove(false)}
      />
    </div>
  );
}

function DayGroup({ id, label, items, justToggled, onToggleVisited, onRemove, removingId, onUpdateIcon, onViewDetail, canEdit }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="trip-day-group">
      {label && <div className="trip-day-label">{label}</div>}
      <SortableContext items={items.map(it => it.itemId)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={[
            'trip-timeline',
            isOver ? 'trip-timeline--over' : '',
            items.length === 0 ? 'trip-timeline--empty' : '',
          ].filter(Boolean).join(' ')}
        >
          {items.length === 0 ? (
            <div className="trip-day-empty">Glissez un élément ici</div>
          ) : items.map((it, i) => (
            <SortableTimelineItem
              key={it.itemId}
              item={it}
              lineProps={computeLineProps(items, i, justToggled)}
              onToggleVisited={() => onToggleVisited(it)}
              onRemove={() => onRemove(it)}
              removingId={removingId}
              onUpdateIcon={(icon, color) => onUpdateIcon(it, icon, color)}
              onViewDetail={onViewDetail}
              canEdit={canEdit}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function TripCard({ trip, onRemoveItem, onDeleteTrip, onToggleVisited, justToggled, onReorderItems, onPersistOrder, onUpdateSettings, onUpdateItemIcon, onRemoveMember, onLeaveTrip }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDeleteTrip, setConfirmingDeleteTrip] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const role = trip.role || 'host';
  const isHost = role === 'host';
  const canEdit = role !== 'read';
  const [activeId, setActiveId] = useState(null);
  const total = trip.monuments.length + (trip.custom_points?.length || 0);
  const visited = trip.monuments.filter(m => m.is_visited).length
    + (trip.custom_points || []).filter(p => p.is_visited).length;
  const progressPct = total > 0 ? (visited / total) * 100 : 0;
  const computedStatus = visited === 0 ? 'planned' : visited === total ? 'completed' : 'ongoing';
  const meta = STATUS_META[computedStatus];
  const dayCount = trip.day_count || 1;

  const [groups, setGroups] = useState(() => buildGroups(trip));
  const itemsSignature = useMemo(
    () => [
      ...trip.monuments.map(m => `m${m.monument_id}:${m.order}:${m.day}:${m.is_visited}:${m.icon}:${m.color}`),
      ...(trip.custom_points || []).map(p => `c${p.custom_point_id}:${p.order}:${p.day}:${p.is_visited}:${p.icon}:${p.color}`),
    ].join('|'),
    [trip.monuments, trip.custom_points]
  );
  useEffect(() => {
    setGroups(buildGroups(trip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.use_days, trip.day_count, itemsSignature]);

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
      const activeIndex = activeItems.findIndex(it => it.itemId === active.id);
      if (activeIndex === -1) return prev;
      const movingItem = activeItems[activeIndex];
      const overIndex = overItems.findIndex(it => it.itemId === over.id);
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
        const oldIndex = items.findIndex(it => it.itemId === active.id);
        const newIndex = items.findIndex(it => it.itemId === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          next = { ...prev, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
        }
      }
      const flat = flattenGroups(next, trip.use_days, dayCount);
      onReorderItems(trip.id, flat);
      onPersistOrder(trip.id, flat);
      return next;
    });
  }

  const activeItem = activeId != null
    ? Object.values(groups).flat().find(it => it.itemId === activeId)
    : null;

  async function handleRemoveItem(item) {
    setRemovingId(item.itemId);
    await onRemoveItem(trip.id, item);
    setRemovingId(null);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDeleteTrip(trip.id);
  }

  async function handleRemoveMember(member) {
    setRemovingMemberId(member.collaborator_id);
    await onRemoveMember(trip.id, member.collaborator_id);
    setRemovingMemberId(null);
  }

  async function handleLeave() {
    setLeaving(true);
    await onLeaveTrip(trip.id);
  }

  function handleViewDetail(item) {
    navigate('/monument', {
      state: {
        monument: {
          id: item.monument_id,
          name: item.name,
          city: item.city,
          latitude: item.latitude,
          longitude: item.longitude,
          category: item.category,
        },
      },
    });
  }

  return (
    <div
      className={`trip-card ${open ? 'trip-card--open' : ''}`}
      style={{ '--trip-accent': meta.color }}
    >
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
        <span className="trip-count">{total} élément{total !== 1 ? 's' : ''}</span>
        {total > 0 && <span className="trip-progress-label">{visited}/{total} visités</span>}
        {!isHost && (
          <span className="trip-role-badge">
            {trip.host ? `Partagé par ${trip.host.username}` : 'Partagé'} · {canEdit ? 'écriture' : 'lecture seule'}
          </span>
        )}
      </div>

      {open && (
        <div className="trip-body">
          {trip.members && trip.members.length > 1 && (
            <div className="trip-members-row">
              {trip.members.map(m => (
                <div className="trip-member-chip" key={m.collaborator_id ?? `host-${m.id}`} title={m.username}>
                  <span className="trip-member-avatar">
                    {m.avatar_url ? <img src={`${API}${m.avatar_url}`} alt="" /> : m.username[0]?.toUpperCase()}
                  </span>
                  <span className="trip-member-name">{m.username}</span>
                </div>
              ))}
            </div>
          )}

          <div className="trip-settings-row">
            {canEdit && (
              <button className="trip-settings-btn" onClick={() => setEditingSettings(o => !o)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                Modifier
              </button>
            )}
            {isHost && (
              <button className="trip-settings-btn" onClick={() => setSharing(true)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.91-2.92-2.91z" />
                </svg>
                Partager
              </button>
            )}
          </div>

          {editingSettings && canEdit && (
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
              {isHost && trip.members && trip.members.filter(m => m.role !== 'host').length > 0 && (
                <div className="trip-settings-members">
                  <span className="trip-settings-members-label">Membres</span>
                  <ul className="trip-settings-members-list">
                    {trip.members.filter(m => m.role !== 'host').map(m => (
                      <li key={m.collaborator_id} className="trip-settings-member-row">
                        <span className="trip-member-avatar">
                          {m.avatar_url ? <img src={`${API}${m.avatar_url}`} alt="" /> : m.username[0]?.toUpperCase()}
                        </span>
                        <span className="trip-member-name">{m.username}</span>
                        <button
                          className="trip-member-remove-btn"
                          onClick={() => setConfirmRemoveMember(m)}
                          disabled={removingMemberId === m.collaborator_id}
                          aria-label={`Retirer ${m.username}`}
                        >
                          {removingMemberId === m.collaborator_id ? (
                            <div className="trip-mini-spinner" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {total === 0 ? (
            <p className="trip-empty">Aucun élément ajouté à ce trajet.</p>
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
                      onToggleVisited={it => onToggleVisited(trip.id, it)}
                      onRemove={handleRemoveItem}
                      removingId={removingId}
                      onUpdateIcon={(it, icon, color) => onUpdateItemIcon(trip.id, it, icon, color)}
                      onViewDetail={handleViewDetail}
                      canEdit={canEdit}
                    />
                  ))}
                  <DayGroup
                    id="day:none"
                    label="Non planifié"
                    items={groups['day:none'] || []}
                    justToggled={justToggled}
                    onToggleVisited={it => onToggleVisited(trip.id, it)}
                    onRemove={handleRemoveItem}
                    removingId={removingId}
                    onUpdateIcon={(it, icon, color) => onUpdateItemIcon(trip.id, it, icon, color)}
                    onViewDetail={handleViewDetail}
                    canEdit={canEdit}
                  />
                </>
              ) : (
                <DayGroup
                  id="day:flat"
                  label={null}
                  items={groups['day:flat'] || []}
                  justToggled={justToggled}
                  onToggleVisited={it => onToggleVisited(trip.id, it)}
                  onRemove={handleRemoveItem}
                  removingId={removingId}
                  onUpdateIcon={(it, icon, color) => onUpdateItemIcon(trip.id, it, icon, color)}
                  onViewDetail={handleViewDetail}
                  canEdit={canEdit}
                />
              )}
              <DragOverlay>
                {activeItem ? (
                  <div className="trip-monument-card trip-monument-card--dragging">
                    {activeItem.kind === 'custom' ? (
                      <TripCustomPointThumb icon={activeItem.icon} color={activeItem.color} />
                    ) : (
                      <TripMonumentThumb monument={{ id: activeItem.monument_id, name: activeItem.name, latitude: activeItem.latitude, longitude: activeItem.longitude }} />
                    )}
                    <div className="trip-monument-info">
                      <span className="trip-monument-name">{activeItem.name}</span>
                      {activeItem.kind === 'custom'
                        ? <span className="trip-monument-city">Point personnalisé</span>
                        : activeItem.city && <span className="trip-monument-city">{activeItem.city}</span>}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          <div className="trip-actions-row">
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
              className="trip-share-btn"
              onClick={() => navigate('/map', { state: { trip, autoShareLocation: true } })}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              Partager ma position
            </button>

            {canEdit && (
              <button
                className="trip-addpoint-btn"
                onClick={() => navigate('/map', { state: { presetTripId: trip.id, presetTripName: trip.name } })}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                Ajouter un point personnalisé
              </button>
            )}

            {isHost && (
              <button
                className="trip-delete-btn"
                onClick={() => setConfirmingDeleteTrip(true)}
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
            )}

            {!isHost && (
              <button
                className="trip-leave-btn"
                onClick={() => setConfirmLeave(true)}
                disabled={leaving}
              >
                {leaving ? (
                  <div className="trip-mini-spinner trip-mini-spinner--red" />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                    </svg>
                    Quitter ce trajet
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {sharing && <ShareTripSheet trip={trip} onClose={() => setSharing(false)} />}

      <ConfirmDialog
        open={confirmingDeleteTrip}
        title={`Supprimer « ${trip.name} » ?`}
        message="Cette action supprimera définitivement ce trajet ainsi que tous ses monuments et points personnalisés associés."
        confirmLabel="Supprimer"
        onConfirm={async () => { setConfirmingDeleteTrip(false); await handleDelete(); }}
        onCancel={() => setConfirmingDeleteTrip(false)}
      />

      <ConfirmDialog
        open={!!confirmRemoveMember}
        title={confirmRemoveMember ? `Retirer ${confirmRemoveMember.username} ?` : ''}
        message="Cette personne perdra l'accès à ce trajet."
        confirmLabel="Retirer"
        onConfirm={async () => { const m = confirmRemoveMember; setConfirmRemoveMember(null); await handleRemoveMember(m); }}
        onCancel={() => setConfirmRemoveMember(null)}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={`Quitter « ${trip.name} » ?`}
        message="Vous perdrez l'accès à ce trajet. Le host pourra vous réinviter plus tard."
        confirmLabel="Quitter"
        onConfirm={async () => { setConfirmLeave(false); await handleLeave(); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

export default function Travel() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justToggled, setJustToggled] = useState(null);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    try {
      const r = await apiFetch(`/trips/user/${user.id}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setTrips(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch {
      setLoadError('Impossible de charger vos trajets pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  async function createTrip() {
    if (!newTripName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const r = await apiFetch('/trips', {
        method: 'POST',
        body: JSON.stringify({ name: newTripName.trim() }),
      });
      if (!r.ok) throw new Error();
      setNewTripName('');
      setShowCreate(false);
      fetchTrips();
    } catch {
      setActionError('Impossible de créer le trajet.');
    } finally {
      setCreating(false);
    }
  }

  async function removeMonument(tripId, monumentId) {
    const r = await apiFetch(`/trips/${tripId}/monuments/${monumentId}`, { method: 'DELETE' });
    if (!r.ok) { setActionError('Impossible de retirer ce monument.'); return; }
    fetchTrips();
  }

  async function deleteCustomPoint(pointId) {
    const r = await apiFetch(`/custom-points/${pointId}`, { method: 'DELETE' });
    if (!r.ok) { setActionError('Impossible de supprimer ce point.'); return; }
    fetchTrips();
  }

  async function removeItem(tripId, item) {
    setActionError(null);
    if (item.kind === 'custom') {
      await deleteCustomPoint(item.custom_point_id);
    } else {
      await removeMonument(tripId, item.monument_id);
    }
  }

  async function deleteTrip(tripId) {
    setActionError(null);
    const r = await apiFetch(`/trips/${tripId}`, { method: 'DELETE' });
    if (!r.ok) { setActionError('Impossible de supprimer ce trajet.'); return; }
    fetchTrips();
  }

  async function removeMember(tripId, collaboratorId) {
    setActionError(null);
    const r = await apiFetch(`/trips/${tripId}/collaborators/${collaboratorId}`, { method: 'DELETE' });
    if (!r.ok) { setActionError('Impossible de retirer ce membre.'); return; }
    fetchTrips();
  }

  async function leaveTrip(tripId) {
    setActionError(null);
    const r = await apiFetch(`/trips/${tripId}/leave`, { method: 'POST' });
    if (!r.ok) { setActionError('Impossible de quitter ce trajet.'); return; }
    fetchTrips();
  }

  async function toggleVisited(tripId, item) {
    const nextVisited = !item.is_visited;
    setTrips(prev => prev.map(t => t.id !== tripId ? t : {
      ...t,
      monuments: item.kind === 'monument'
        ? t.monuments.map(m => m.monument_id === item.monument_id ? { ...m, is_visited: nextVisited } : m)
        : t.monuments,
      custom_points: item.kind === 'custom'
        ? (t.custom_points || []).map(p => p.custom_point_id === item.custom_point_id ? { ...p, is_visited: nextVisited } : p)
        : t.custom_points,
    }));
    if (nextVisited) {
      setJustToggled(item.itemId);
      setTimeout(() => {
        setJustToggled(id => id === item.itemId ? null : id);
      }, 550);
    }
    try {
      const url = item.kind === 'monument'
        ? `/trips/${tripId}/monuments/${item.monument_id}`
        : `/custom-points/${item.custom_point_id}`;
      const r = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ is_visited: nextVisited }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError('La mise à jour a échoué, statut restauré.');
      fetchTrips();
    }
  }

  function reorderItemsLocal(tripId, items) {
    setTrips(prev => prev.map(t => t.id !== tripId ? t : {
      ...t,
      monuments: items.filter(it => it.kind === 'monument'),
      custom_points: items.filter(it => it.kind === 'custom'),
    }));
  }

  async function persistOrder(tripId, items) {
    const payload = items.map(it => ({
      kind: it.kind,
      monument_id: it.kind === 'monument' ? it.monument_id : null,
      custom_point_id: it.kind === 'custom' ? it.custom_point_id : null,
      order: it.order,
      day: it.day ?? null,
    }));
    try {
      const r = await apiFetch(`/trips/${tripId}/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ items: payload }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError("Le nouvel ordre n'a pas pu être enregistré, ordre restauré.");
      fetchTrips();
    }
  }

  async function updateItemIcon(tripId, item, icon, color) {
    setTrips(prev => prev.map(t => t.id !== tripId ? t : {
      ...t,
      monuments: item.kind === 'monument'
        ? t.monuments.map(m => m.monument_id === item.monument_id ? { ...m, icon, color } : m)
        : t.monuments,
      custom_points: item.kind === 'custom'
        ? (t.custom_points || []).map(p => p.custom_point_id === item.custom_point_id ? { ...p, icon, color } : p)
        : t.custom_points,
    }));
    try {
      const url = item.kind === 'monument'
        ? `/trips/${tripId}/monuments/${item.monument_id}`
        : `/custom-points/${item.custom_point_id}`;
      const r = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ icon, color }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError("L'icône n'a pas pu être enregistrée.");
      fetchTrips();
    }
  }

  async function updateTripSettings(tripId, settings) {
    setTrips(prev => prev.map(t => t.id !== tripId ? t : { ...t, ...settings }));
    try {
      const r = await apiFetch(`/trips/${tripId}`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError('Les réglages du trajet n\'ont pas pu être enregistrés.');
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

      {(loadError || actionError) && (
        <div className="travel-banner-error" onClick={() => { setLoadError(null); setActionError(null); }}>
          {loadError || actionError}
        </div>
      )}

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
              onRemoveItem={removeItem}
              onDeleteTrip={deleteTrip}
              onToggleVisited={toggleVisited}
              justToggled={justToggled}
              onReorderItems={reorderItemsLocal}
              onPersistOrder={persistOrder}
              onUpdateSettings={updateTripSettings}
              onUpdateItemIcon={updateItemIcon}
              onRemoveMember={removeMember}
              onLeaveTrip={leaveTrip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
