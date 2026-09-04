import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import ConfirmDialog from './ConfirmDialog';
import ImageLightbox from './ImageLightbox';
import TripCoverPicker from './TripCoverPicker';
import API_URL from '../config';
import '../css/TripPhotos.css';

const API = API_URL;

// Mur de photos partagé d'un trajet : tout membre (host/write/read) peut ajouter
// des photos avec un petit mot facultatif, le nom de l'auteur reste toujours
// affiché. Suppression réservée à l'auteur ou au host (modération).
export default function TripPhotosSheet({ trip, isHost, onClose, onCoverChange }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pickingCover, setPickingCover] = useState(false);
  const [settingCover, setSettingCover] = useState(false);

  function load() {
    setLoading(true);
    apiFetch(`/trips/${trip.id}/photos`)
      .then(r => r.json())
      .then(d => setPhotos(Array.isArray(d.photos) ? d.photos : []))
      .catch(() => setError('Impossible de charger les photos.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPending(files.map(file => ({ file, previewUrl: URL.createObjectURL(file), caption: '' })));
    e.target.value = '';
  }

  function updatePendingCaption(idx, caption) {
    setPending(prev => prev.map((p, i) => i === idx ? { ...p, caption } : p));
  }

  function removePending(idx) {
    setPending(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function submitPending() {
    if (!pending.length) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      pending.forEach(p => formData.append('files', p.file));
      pending.forEach(p => formData.append('captions', p.caption || ''));
      const r = await apiFetch(`/trips/${trip.id}/photos`, { method: 'POST', body: formData });
      if (!r.ok) throw new Error();
      pending.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      load();
    } catch {
      setError("L'envoi des photos a échoué.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo) {
    setDeletingId(photo.id);
    try {
      const r = await apiFetch(`/trips/${trip.id}/photos/${photo.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (trip.cover_photo_id === photo.id) onCoverChange(trip.id, { cover_photo_id: null, cover_photo_url: null });
    } catch {
      setError('Impossible de supprimer cette photo.');
    } finally {
      setDeletingId(null);
    }
  }

  async function setCover(photo) {
    setSettingCover(true);
    setError(null);
    try {
      const r = await apiFetch(`/trips/${trip.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ cover_photo_id: photo.id }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      onCoverChange(trip.id, { cover_photo_id: data.cover_photo_id, cover_photo_url: data.cover_photo_url });
      setPickingCover(false);
    } catch {
      setError('Impossible de définir cette photo comme couverture.');
    } finally {
      setSettingCover(false);
    }
  }

  async function clearCover() {
    setSettingCover(true);
    setError(null);
    try {
      const r = await apiFetch(`/trips/${trip.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ clear_cover: true }),
      });
      if (!r.ok) throw new Error();
      onCoverChange(trip.id, { cover_photo_id: null, cover_photo_url: null });
      setPickingCover(false);
    } catch {
      setError('Impossible de retirer la couverture.');
    } finally {
      setSettingCover(false);
    }
  }

  const canDelete = photo => photo.uploaded_by === user.id || isHost;

  return (
    <>
      <div className="tps-backdrop" onClick={onClose} />
      <div className="tps-sheet" role="dialog" aria-modal="true">
        <div className="tps-header">
          <h3>Photos de « {trip.name} »</h3>
          <button className="tps-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {error && <div className="tps-error">{error}</div>}

        <div className="tps-upload-row">
          <button className="tps-upload-btn" onClick={() => fileInputRef.current?.click()}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Ajouter des photos
          </button>
          {isHost && (
            <button className="tps-cover-btn" onClick={() => setPickingCover(true)}>
              Choisir la couverture
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={onFilesSelected}
          />
        </div>

        {pending.length > 0 && (
          <div className="tps-pending">
            <div className="tps-pending-label">Un petit mot pour ce souvenir (facultatif) :</div>
            {pending.map((p, i) => (
              <div className="tps-pending-item" key={i}>
                <img src={p.previewUrl} alt="" className="tps-pending-thumb" />
                <input
                  className="tps-pending-caption"
                  type="text"
                  placeholder="Un souvenir à propos de cette photo…"
                  value={p.caption}
                  onChange={e => updatePendingCaption(i, e.target.value)}
                  maxLength={280}
                />
                <button className="tps-pending-remove" onClick={() => removePending(i)} aria-label="Retirer">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            ))}
            <button className="tps-pending-submit" disabled={uploading} onClick={submitPending}>
              {uploading ? <div className="tps-spinner tps-spinner--light" /> : `Envoyer ${pending.length} photo${pending.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {loading ? (
          <div className="tps-loading"><div className="tps-spinner" />Chargement…</div>
        ) : photos.length === 0 ? (
          <p className="tps-empty">Aucune photo pour l'instant. Soyez le premier à en ajouter !</p>
        ) : (
          <div className="tps-grid">
            {photos.map((photo, i) => (
              <div className="tps-photo-card" key={photo.id}>
                <button className="tps-photo-btn" onClick={() => setLightboxIndex(i)}>
                  <img src={`${API}${photo.image_url}`} alt="" />
                  {trip.cover_photo_id === photo.id && <span className="tps-cover-badge">Couverture</span>}
                </button>
                <div className="tps-photo-meta">
                  <span className="tps-photo-avatar">
                    {photo.uploader_avatar_url
                      ? <img src={`${API}${photo.uploader_avatar_url}`} alt="" />
                      : photo.uploader_username?.[0]?.toUpperCase()}
                  </span>
                  <span className="tps-photo-author">{photo.uploader_username || 'Utilisateur'}</span>
                  {canDelete(photo) && (
                    <button
                      className="tps-photo-delete"
                      disabled={deletingId === photo.id}
                      onClick={() => setConfirmDelete(photo)}
                      aria-label="Supprimer cette photo"
                    >
                      {deletingId === photo.id ? <div className="tps-spinner" /> : (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={photos.map(p => `${API}${p.image_url}`)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          captions={photos.map(p => p.caption)}
          subtitles={photos.map(p => `Posté par ${p.uploader_username || 'un membre'}`)}
        />
      )}

      {pickingCover && (
        <TripCoverPicker
          trip={trip}
          tripPhotos={photos}
          onSelect={setCover}
          onClear={clearCover}
          settingCover={settingCover}
          onClose={() => setPickingCover(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Supprimer cette photo ?"
        message="Cette photo sera définitivement supprimée du trajet."
        confirmLabel="Supprimer"
        onConfirm={async () => { const p = confirmDelete; setConfirmDelete(null); await deletePhoto(p); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
