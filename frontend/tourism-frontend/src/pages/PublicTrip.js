import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../services/api';
import ImageLightbox from '../components/ImageLightbox';
import { ICON_LIBRARY } from '../utils/pointIcons';
import API_URL from '../config';
import '../css/PublicTrip.css';

const API = API_URL;

// Vue en lecture seule d'un trajet marqué public — accessible sans être membre
// (et sans compte), aucune action d'édition. Reflète GET /trips/{id}/public :
// itinéraire + couverture toujours visibles si is_public, mur de photos
// seulement si show_photos_publicly (ou si le viewer est lui-même membre).
export default function PublicTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    setLoading(true);
    setForbidden(false);
    apiFetch(`/trips/${tripId}/public`)
      .then(r => {
        if (r.status === 403 || r.status === 404) { setForbidden(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => { if (data) setTrip(data); })
      .catch(() => setForbidden(true))
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return <div className="pubtrip-page"><div className="pubtrip-card">Chargement…</div></div>;
  }
  if (forbidden || !trip) {
    return (
      <div className="pubtrip-page">
        <div className="pubtrip-card">
          <p>Ce trajet n'est pas accessible (privé ou introuvable).</p>
          <button className="pubtrip-back-btn" onClick={() => navigate('/')}>Retour à l'accueil</button>
        </div>
      </div>
    );
  }

  const stops = [
    ...trip.monuments.map(m => ({ ...m, kind: 'monument' })),
    ...trip.custom_points.map(p => ({ ...p, kind: 'custom' })),
  ].sort((a, b) => a.order - b.order);

  return (
    <div className="pubtrip-page">
      <div className="pubtrip-card">
        <button className="pubtrip-back" onClick={() => navigate(-1)} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>

        {trip.cover_photo_url && (
          <div className="pubtrip-cover">
            <img src={`${API}${trip.cover_photo_url}`} alt="" />
          </div>
        )}

        <div className="pubtrip-header">
          <h1 className="pubtrip-title">{trip.name}</h1>
          <div className="pubtrip-host">
            <span className="pubtrip-host-avatar">
              {trip.host.avatar_url ? <img src={`${API}${trip.host.avatar_url}`} alt="" /> : trip.host.username[0]?.toUpperCase()}
            </span>
            <span>Par {trip.host.username}</span>
          </div>
          {trip.description && <p className="pubtrip-description">{trip.description}</p>}
        </div>

        {stops.length === 0 ? (
          <p className="pubtrip-empty">Ce trajet ne contient aucune étape pour l'instant.</p>
        ) : (
          <ul className="pubtrip-stops">
            {stops.map(s => {
              const def = s.kind === 'custom' ? (ICON_LIBRARY[s.icon] || ICON_LIBRARY.pin) : null;
              return (
                <li className="pubtrip-stop" key={`${s.kind}:${s.kind === 'custom' ? s.custom_point_id : s.monument_id}`}>
                  {s.kind === 'custom' ? (
                    <span className="pubtrip-stop-icon" style={{ background: s.color || def.color }}>
                      {def.glyph
                        ? <svg viewBox="0 0 24 24" fill="#fff" width="16" height="16" dangerouslySetInnerHTML={{ __html: def.glyph }} />
                        : <span className="pubtrip-stop-dot" />}
                    </span>
                  ) : (
                    <span className="pubtrip-stop-icon pubtrip-stop-icon--monument">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                      </svg>
                    </span>
                  )}
                  <div className="pubtrip-stop-info">
                    <span className="pubtrip-stop-name">{s.name}</span>
                    {s.kind === 'monument' && s.city && <span className="pubtrip-stop-city">{s.city}</span>}
                  </div>
                  {s.day != null && <span className="pubtrip-stop-day">Jour {s.day}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {trip.show_photos_publicly && (
          <div className="pubtrip-photos">
            <h2 className="pubtrip-section-label">Photos du trajet</h2>
            {trip.photos.length === 0 ? (
              <p className="pubtrip-empty">Aucune photo partagée pour l'instant.</p>
            ) : (
              <div className="pubtrip-photos-grid">
                {trip.photos.map((p, i) => (
                  <button key={p.id} className="pubtrip-photo-btn" onClick={() => setLightboxIndex(i)}>
                    <img src={`${API}${p.image_url}`} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={trip.photos.map(p => `${API}${p.image_url}`)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          captions={trip.photos.map(p => p.caption)}
          subtitles={trip.photos.map(p => `Posté par ${p.uploader_username || 'un membre'}`)}
        />
      )}
    </div>
  );
}
