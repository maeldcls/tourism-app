import { useState } from 'react';
import { ICON_LIBRARY } from '../utils/pointIcons';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import '../css/MapSheets.css';
import '../css/CustomPointSheet.css'; // réutilise .cps-toggle / .cps-visibility-*
import '../css/PointsManagerSheet.css';

function pointKey(p) {
  return p.kind === 'monument' ? `m-${p.trip_id}-${p.monument_id}` : `c-${p.custom_point_id}`;
}

// Regroupe les points par trajet, avec une section à part pour les points
// personnalisés non rattachés à un trajet (les monuments sont toujours dans un
// trajet puisqu'ils viennent de TripMonument).
function groupPoints(points) {
  const byTrip = new Map();
  const unassigned = [];
  for (const p of points) {
    if (p.trip_id == null) {
      unassigned.push(p);
      continue;
    }
    if (!byTrip.has(p.trip_id)) {
      byTrip.set(p.trip_id, { id: p.trip_id, name: p.trip_name || 'Trajet', items: [] });
    }
    byTrip.get(p.trip_id).items.push(p);
  }
  return { groups: [...byTrip.values()], unassigned };
}

function PointRow({ point, trips, onToggleHidden, onMove, onDelete }) {
  const def = ICON_LIBRARY[point.icon] || ICON_LIBRARY.pin;
  const color = point.color || def.color;
  const [movingOpen, setMovingOpen] = useState(false);

  function handleMoveChange(e) {
    const value = e.target.value;
    setMovingOpen(false);
    if (value === '__current__') return;
    onMove(point, value === '__unassigned__' ? null : Number(value));
  }

  return (
    <div className={`pms-row${point.is_hidden ? ' pms-row--hidden' : ''}`}>
      <span className="pms-row-dot" style={{ background: color }} />
      <span className="pms-row-name">{point.name}</span>
      {point.is_visited && <span className="pms-row-visited">Visité</span>}

      {movingOpen ? (
        <select
          className="pms-move-select"
          autoFocus
          defaultValue="__current__"
          onChange={handleMoveChange}
          onBlur={() => setMovingOpen(false)}
        >
          <option value="__current__" disabled>Déplacer vers…</option>
          {point.kind === 'custom' && point.trip_id != null && (
            <option value="__unassigned__">Non attribué</option>
          )}
          {trips.filter(t => t.id !== point.trip_id).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      ) : (
        <button
          className="pms-icon-btn"
          onClick={() => setMovingOpen(true)}
          aria-label={`Déplacer ${point.name} vers un autre trajet`}
          title="Déplacer vers un autre trajet"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M9 3L5 6.99h3V14h2V6.99h3L9 3zm7 14.01V10h-2v7.01h-3L15 21l4-3.99h-3z" />
          </svg>
        </button>
      )}

      <button
        className="pms-visibility-btn"
        onClick={() => onToggleHidden(point)}
        aria-label={point.is_hidden ? `Afficher ${point.name} sur la carte` : `Masquer ${point.name} de la carte`}
        title={point.is_hidden ? 'Afficher sur la carte' : 'Masquer de la carte'}
      >
        {point.is_hidden ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
          </svg>
        )}
      </button>

      {point.kind === 'custom' && (
        <button
          className="pms-icon-btn pms-icon-btn--danger"
          onClick={() => onDelete(point)}
          aria-label={`Supprimer ${point.name}`}
          title="Supprimer"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function PointsGroupSection({ title, items, trips, onToggleHidden, onMove, onDelete }) {
  return (
    <div className="pms-group">
      <div className="pms-group-title">{title}</div>
      {items.map(p => (
        <PointRow key={pointKey(p)} point={p} trips={trips} onToggleHidden={onToggleHidden} onMove={onMove} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function PointsManagerSheet({ open, points, trips, onClose, onToggleHidden, onMovePoint, onDeleteCustomPoint }) {
  const { user, updateUser } = useAuth();
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [togglingPref, setTogglingPref] = useState(false);

  if (!open) return null;

  const { groups, unassigned } = groupPoints(points);

  async function handleConfirmDelete() {
    await onDeleteCustomPoint(confirmingDelete);
    setConfirmingDelete(null);
  }

  async function handleToggleHideOthers() {
    const next = !user.hide_others_public_points;
    setTogglingPref(true);
    updateUser({ hide_others_public_points: next });
    try {
      const r = await apiFetch('/profile/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ hide_others_public_points: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      updateUser({ hide_others_public_points: !next });
    } finally {
      setTogglingPref(false);
    }
  }

  return (
    <>
      <div className="map-sheet-backdrop" onClick={onClose} />
      <div className="pms-sheet map-sheet" role="dialog" aria-modal="true">
        <div className="map-sheet-handle" />

        <div className="pms-header">
          <h3>Mes points</h3>
          <button className="pms-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {user && (
          <div className="cps-visibility-row pms-hide-others-row">
            <div className="cps-visibility-text">
              <span className="cps-visibility-title">Points publics des autres</span>
              <span className="cps-visibility-desc">
                {user.hide_others_public_points
                  ? 'Masqués sur la carte.'
                  : 'Affichés sur la carte quand vous zoomez.'}
              </span>
            </div>
            <button
              className={`cps-toggle${user.hide_others_public_points ? ' cps-toggle--on' : ''}`}
              onClick={handleToggleHideOthers}
              disabled={togglingPref}
              role="switch"
              aria-checked={!!user.hide_others_public_points}
              aria-label="Masquer les points publics des autres utilisateurs"
            >
              <span className="cps-toggle-knob" />
            </button>
          </div>
        )}

        {points.length === 0 ? (
          <p className="pms-empty">Aucun point pour l'instant. Ajoutez un monument à un trajet ou un point personnalisé depuis la carte.</p>
        ) : (
          <div className="pms-scroll">
            {groups.map(g => (
              <PointsGroupSection
                key={g.id}
                title={g.name}
                items={g.items}
                trips={trips}
                onToggleHidden={onToggleHidden}
                onMove={onMovePoint}
                onDelete={setConfirmingDelete}
              />
            ))}
            {unassigned.length > 0 && (
              <PointsGroupSection
                title="Non attribués"
                items={unassigned}
                trips={trips}
                onToggleHidden={onToggleHidden}
                onMove={onMovePoint}
                onDelete={setConfirmingDelete}
              />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title={confirmingDelete ? `Supprimer ${confirmingDelete.name} ?` : ''}
        message="Ce point personnalisé sera définitivement supprimé."
        confirmLabel="Supprimer"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </>
  );
}
