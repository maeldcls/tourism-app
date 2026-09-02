import { useState, useEffect, useRef } from 'react';
import '../css/MapSheets.css';
import '../css/MonumentSheet.css'; // classes génériques de galerie (sheet-gallery/sheet-hero/sheet-thumbnails)
import '../css/CustomPointSheet.css';
import ImageLightbox from './ImageLightbox';
import ConfirmDialog from './ConfirmDialog';
import MonumentIconEditor from './MonumentIconEditor';
import { ICON_LIBRARY } from '../utils/pointIcons';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiFetchJson } from '../services/api';
import API_URL from '../config';
import { useResizableSheet } from '../hooks/useResizableSheet';

const MAX_VISIBLE_THUMBS = 5;
const MAX_PHOTOS = 6;
const DEFAULT_HEIGHT_VH = 50;

function IconBadge({ icon, color }) {
  const def = ICON_LIBRARY[icon] || ICON_LIBRARY.pin;
  const fill = color || def.color;
  return (
    <span className="cps-icon-badge" style={{ background: fill }}>
      {def.glyph ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" dangerouslySetInnerHTML={{ __html: def.glyph }} />
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="6" fill="#fff" opacity="0.9" /></svg>
      )}
    </span>
  );
}

// ── Bottom-sheet d'un point personnalisé, ouvert au clic sur la carte ──────────
// Équivalent de MonumentSheet pour les points custom : galerie photo (gérée par
// le propriétaire), renommage, icône/couleur, bascule public/privé, suppression.
// Lecture seule quand ce n'est pas le point de l'utilisateur courant (point
// public de quelqu'un d'autre).
export default function CustomPointSheet({ pointRef, onClose, onUpdated, onDeleted }) {
  const { user } = useAuth();
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [activeImg, setActiveImg]         = useState(0);
  const [uploading, setUploading]         = useState(false);
  const [editingName, setEditingName]     = useState(false);
  const [nameDraft, setNameDraft]         = useState('');
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const fileInputRef = useRef(null);
  const { heightVh, reset: resetHeight, handleProps } = useResizableSheet(DEFAULT_HEIGHT_VH);

  const pointId = pointRef?.id ?? null;

  useEffect(() => {
    setActiveImg(0);
    setEditingName(false);
    setError(null);
    resetHeight();
    if (!pointId) { setDetail(null); return; }

    let cancelled = false;
    setLoading(true);
    apiFetchJson(`/custom-points/${pointId}`)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setError('Impossible de charger ce point.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [pointId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pointRef) return null;

  const isOwner = !!(user && detail && detail.user_id === user.id);
  // Les URLs de photos renvoyées par l'API sont relatives (/uploads/...) — il
  // faut les préfixer par l'origine de l'API, sinon elles se résolvent contre
  // l'origine du frontend et 404.
  const images = (detail?.images || []).map(img => ({
    ...img,
    url: img.url.startsWith('/') ? `${API_URL}${img.url}` : img.url,
  }));
  const visibleImgs = images.slice(0, MAX_VISIBLE_THUMBS);
  const extraCount  = images.length - MAX_VISIBLE_THUMBS;

  async function patchPoint(patch) {
    setDetail(prev => ({ ...prev, ...patch }));
    onUpdated?.(pointId, patch);
    try {
      const r = await apiFetch(`/custom-points/${pointId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (!r.ok) throw new Error();
    } catch {
      setError('La modification n\'a pas pu être enregistrée.');
    }
  }

  function commitName() {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== detail.name) patchPoint({ name: trimmed });
  }

  async function handleTogglePublic() {
    setTogglingPublic(true);
    await patchPoint({ is_public: !detail.is_public });
    setTogglingPublic(false);
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (images.length + files.length > MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos par point.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach(f => form.append('files', f));
      const data = await apiFetchJson(`/custom-points/${pointId}/photos`, { method: 'POST', body: form });
      setDetail(prev => ({ ...prev, images: data.images }));
    } catch {
      setError('L\'envoi des photos a échoué.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(photoId) {
    const prevImages = images;
    setDetail(prev => ({ ...prev, images: prev.images.filter(img => img.id !== photoId) }));
    setActiveImg(0);
    try {
      const r = await apiFetch(`/custom-points/${pointId}/photos/${photoId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
    } catch {
      setError('La suppression de la photo a échoué.');
      setDetail(prev => ({ ...prev, images: prevImages }));
    }
  }

  async function handleSaveIcon(icon, color) {
    await patchPoint({ icon, color });
  }

  async function handleDelete() {
    try {
      const r = await apiFetch(`/custom-points/${pointId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      onDeleted?.(pointId);
      setConfirmingDelete(false);
    } catch {
      setError('Impossible de supprimer ce point.');
      setConfirmingDelete(false);
    }
  }

  return (
    <>
      <div className="map-sheet-backdrop" onClick={onClose} />
      <div className="sheet map-sheet cps-sheet" style={{ height: `${heightVh}vh`, maxHeight: '85vh' }}>
        <div className="map-sheet-handle-zone" {...handleProps}>
          <div className="map-sheet-handle" />
        </div>

        <div className="sheet-header">
          <span className="cps-badge-row">
            <IconBadge icon={detail?.icon ?? pointRef.icon} color={detail?.color ?? pointRef.color} />
            {isOwner && (
              <button className="cps-edit-icon-btn" onClick={() => setShowIconEditor(true)} aria-label="Changer l'icône">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z" />
                </svg>
              </button>
            )}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {editingName ? (
          <input
            className="cps-title-input"
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          />
        ) : (
          <h2
            className={`sheet-title${isOwner ? ' cps-title--editable' : ''}`}
            onClick={() => { if (isOwner) { setNameDraft(detail.name); setEditingName(true); } }}
          >
            {detail?.name ?? pointRef.name}
          </h2>
        )}

        {!isOwner && detail?.owner && (
          <div className="sheet-location cps-owner-line">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            Ajouté par {detail.owner.username}
          </div>
        )}

        {loading && (
          <div className="sheet-gallery">
            <div className="sheet-hero sheet-hero--skeleton" />
          </div>
        )}

        {!loading && images.length > 0 && (
          <div className="sheet-gallery">
            <button className="sheet-hero" onClick={() => setLightboxIndex(activeImg)} aria-label="Agrandir la photo">
              <img src={(images[activeImg] || images[0]).url} alt="" />
            </button>

            <div className="sheet-thumbnails">
              {visibleImgs.map((img, i) => (
                <div key={img.id} className="cps-thumb-wrap">
                  <button
                    className={`sheet-thumb${i === activeImg ? ' sheet-thumb--active' : ''}`}
                    onClick={() => setActiveImg(i)}
                    aria-label={`Photo ${i + 1}`}
                  >
                    <img src={img.url} alt="" />
                  </button>
                  {isOwner && (
                    <button
                      className="cps-thumb-delete"
                      onClick={() => handleDeletePhoto(img.id)}
                      aria-label="Supprimer cette photo"
                      title="Supprimer cette photo"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {extraCount > 0 && (
                <button
                  className="sheet-thumb sheet-thumb--more"
                  onClick={() => setLightboxIndex(MAX_VISIBLE_THUMBS)}
                  aria-label={`Voir ${extraCount} photos de plus`}
                >
                  +{extraCount}
                </button>
              )}

              {isOwner && images.length < MAX_PHOTOS && (
                <button
                  className="sheet-thumb cps-thumb-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Ajouter une photo"
                >
                  {uploading ? <div className="cps-spinner" /> : '+'}
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && images.length === 0 && (
          <div className="sheet-gallery">
            {isOwner ? (
              <button className="cps-empty-gallery" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <div className="cps-spinner" /> : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 14H6l3.5-4.5 2.5 3.01L15.5 9 18 17z" />
                    </svg>
                    Ajouter des photos
                  </>
                )}
              </button>
            ) : (
              <p className="sheet-description">Aucune photo pour ce point.</p>
            )}
          </div>
        )}

        {isOwner && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={handleFilesSelected}
          />
        )}

        {error && <p className="cps-error">{error}</p>}

        {isOwner && (
          <div className="cps-visibility-row">
            <div className="cps-visibility-text">
              <span className="cps-visibility-title">Point {detail?.is_public ? 'public' : 'privé'}</span>
              <span className="cps-visibility-desc">
                {detail?.is_public
                  ? 'Visible par tous les utilisateurs sur la carte.'
                  : 'Visible seulement par vous.'}
              </span>
            </div>
            <button
              className={`cps-toggle${detail?.is_public ? ' cps-toggle--on' : ''}`}
              onClick={handleTogglePublic}
              disabled={togglingPublic || loading}
              role="switch"
              aria-checked={!!detail?.is_public}
              aria-label="Basculer la visibilité du point"
            >
              <span className="cps-toggle-knob" />
            </button>
          </div>
        )}

        {isOwner && (
          <button className="cps-delete-btn" onClick={() => setConfirmingDelete(true)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Supprimer ce point
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map(img => img.url)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}

      {showIconEditor && (
        <MonumentIconEditor
          name={detail?.name ?? pointRef.name}
          icon={detail?.icon ?? pointRef.icon}
          color={detail?.color ?? pointRef.color}
          onSave={handleSaveIcon}
          onClose={() => setShowIconEditor(false)}
        />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title={`Supprimer ${detail?.name ?? pointRef.name} ?`}
        message="Ce point personnalisé et ses photos seront définitivement supprimés."
        confirmLabel="Supprimer"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
