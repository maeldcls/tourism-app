import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import API_URL from '../config';
import '../css/TripPhotos.css';

const API = API_URL;

// Choix de la couverture d'un trajet : soit parmi les photos déjà postées sur ce
// trajet, soit parmi les photos personnelles de l'utilisateur postées sur ses
// autres trajets (galerie profil, /profile/{id}/photos).
export default function TripCoverPicker({ trip, tripPhotos, onSelect, onClear, settingCover, onClose }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('trip');
  const [myPhotos, setMyPhotos] = useState(null);
  const [loadingMine, setLoadingMine] = useState(false);

  useEffect(() => {
    if (tab === 'mine' && myPhotos === null) {
      setLoadingMine(true);
      apiFetch(`/profile/${user.id}/photos?limit=60`)
        .then(r => r.json())
        .then(d => setMyPhotos(Array.isArray(d.items) ? d.items : []))
        .catch(() => setMyPhotos([]))
        .finally(() => setLoadingMine(false));
    }
  }, [tab, myPhotos, user.id]);

  const list = tab === 'trip' ? tripPhotos : (myPhotos || []);

  return (
    <>
      <div className="tps-backdrop" onClick={onClose} />
      <div className="tcp-sheet" role="dialog" aria-modal="true">
        <div className="tps-header">
          <h3>Choisir une couverture</h3>
          <button className="tps-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="tcp-tabs">
          <button className={`tcp-tab${tab === 'trip' ? ' tcp-tab--active' : ''}`} onClick={() => setTab('trip')}>
            Photos du trajet
          </button>
          <button className={`tcp-tab${tab === 'mine' ? ' tcp-tab--active' : ''}`} onClick={() => setTab('mine')}>
            Mes photos
          </button>
        </div>

        {trip.cover_photo_id && (
          <button className="tcp-clear-btn" disabled={settingCover} onClick={onClear}>
            Retirer la couverture actuelle
          </button>
        )}

        {tab === 'mine' && loadingMine ? (
          <div className="tps-loading"><div className="tps-spinner" />Chargement…</div>
        ) : list.length === 0 ? (
          <p className="tps-empty">
            {tab === 'trip' ? 'Aucune photo sur ce trajet.' : "Vous n'avez pas encore posté de photo sur un trajet."}
          </p>
        ) : (
          <div className="tcp-grid">
            {list.map(photo => (
              <button
                key={photo.id}
                className={`tcp-photo-btn${trip.cover_photo_id === photo.id ? ' tcp-photo-btn--active' : ''}`}
                disabled={settingCover}
                onClick={() => onSelect(photo)}
                title={photo.trip_name || undefined}
              >
                <img src={`${API}${photo.image_url}`} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
