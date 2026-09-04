import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import VisitedMonumentCard from '../components/VisitedMonumentCard';
import ImageLightbox from '../components/ImageLightbox';
import API_URL from '../config';
import '../css/UserProfile.css';

const API = API_URL;
const PREVIEW_COUNT = 6;
const TRIPS_PREVIEW_COUNT = 4;

export default function UserProfile() {
  const { userId } = useParams();
  const { token, user: me } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [working, setWorking] = useState(false);

  // Ces trois sections suivent leur propre règle de visibilité côté backend (public
  // OU ami), indépendante du "profil privé = nom+photo même pour les amis" qui ne
  // s'applique qu'aux champs de base ci-dessus — donc chargées à part, et simplement
  // absentes si l'API répond 403 (pas d'accès) plutôt que de bloquer toute la page.
  const [visitedPreview, setVisitedPreview] = useState(null);
  const [visitedTotal, setVisitedTotal] = useState(0);
  const [photosPreview, setPhotosPreview] = useState(null);
  const [photosTotal, setPhotosTotal] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [tripsPreview, setTripsPreview] = useState(null);
  const [tripsTotal, setTripsTotal] = useState(0);

  useEffect(() => {
    if (String(me?.id) === userId) { navigate('/profile', { replace: true }); return; }
    setLoading(true);
    setNotFound(false);
    fetch(`${API}/profile/${userId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setProfile)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [userId, token, me, navigate]);

  useEffect(() => {
    if (String(me?.id) === userId) return;
    let cancelled = false;

    apiFetch(`/visits/user/${userId}?limit=${PREVIEW_COUNT}&offset=0`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) { setVisitedPreview(data.items); setVisitedTotal(data.total); } })
      .catch(() => {});

    apiFetch(`/profile/${userId}/photos?limit=${PREVIEW_COUNT}&offset=0`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) { setPhotosPreview(data.items); setPhotosTotal(data.total); } })
      .catch(() => {});

    apiFetch(`/profile/${userId}/trips/public?limit=${TRIPS_PREVIEW_COUNT}&offset=0`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) { setTripsPreview(data.items); setTripsTotal(data.total); } })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [userId, me]);

  async function sendRequest() {
    setWorking(true);
    try {
      const r = await fetch(`${API}/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: Number(userId) }),
      });
      if (r.ok) setProfile(p => ({ ...p, relation: 'pending_outgoing' }));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div className="uprofile-page"><div className="uprofile-card">Chargement…</div></div>;
  }
  if (notFound || !profile) {
    return <div className="uprofile-page"><div className="uprofile-card">Utilisateur introuvable.</div></div>;
  }

  const initials = profile.username[0]?.toUpperCase();

  return (
    <div className="uprofile-page">
      <div className="uprofile-card">
        <button className="uprofile-back" onClick={() => navigate(-1)} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
          </svg>
        </button>

        <div className="uprofile-avatar">
          {profile.avatar_url ? <img src={`${API}${profile.avatar_url}`} alt="" /> : initials}
        </div>
        <h1 className="uprofile-username">{profile.username}</h1>

        {profile.relation && profile.relation !== 'none' && (
          <span className={`uprofile-relation uprofile-relation--${profile.relation}`}>
            {profile.relation === 'friends' && 'Ami·e'}
            {profile.relation === 'pending_outgoing' && 'Demande envoyée'}
            {profile.relation === 'pending_incoming' && 'Vous a envoyé une demande'}
          </span>
        )}
        {(!profile.relation || profile.relation === 'none') && token && (
          <button className="uprofile-add-btn" onClick={sendRequest} disabled={working}>
            Ajouter en ami
          </button>
        )}

        {profile.is_public === false ? (
          <p className="uprofile-private-note">Ce profil est privé.</p>
        ) : (
          <>
            <div className="uprofile-stats">
              <div className="uprofile-stat">
                <span className="uprofile-stat-value">{profile.level}</span>
                <span className="uprofile-stat-label">Niveau</span>
              </div>
              <div className="uprofile-stat-divider" />
              <div className="uprofile-stat">
                <span className="uprofile-stat-value">{profile.xp}</span>
                <span className="uprofile-stat-label">XP total</span>
              </div>
              <div className="uprofile-stat-divider" />
              <div className="uprofile-stat">
                <span className="uprofile-stat-value">{profile.total_visits}</span>
                <span className="uprofile-stat-label">Visites</span>
              </div>
            </div>

            {profile.badges.length > 0 && (
              <div className="uprofile-badges">
                <div className="uprofile-badges-label">Badges</div>
                <div className="uprofile-badges-list">
                  {profile.badges.map(b => (
                    <span key={b.badge_id} className="uprofile-badge" title={b.description || ''}>
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {visitedPreview && visitedPreview.length > 0 && (
          <div className="uprofile-section">
            <div className="uprofile-section-header">
              <h2 className="uprofile-section-title">Lieux visités</h2>
              <span className="uprofile-section-count">{visitedTotal}</span>
            </div>
            <div className="uprofile-visited-grid">
              {visitedPreview.map(v => (
                <VisitedMonumentCard key={v.visit_id} visit={v} />
              ))}
            </div>
          </div>
        )}

        {photosPreview && photosPreview.length > 0 && (
          <div className="uprofile-section">
            <div className="uprofile-section-header">
              <h2 className="uprofile-section-title">Photos de ses trajets</h2>
              <span className="uprofile-section-count">{photosTotal}</span>
            </div>
            <div className="uprofile-photos-grid">
              {photosPreview.map((p, i) => (
                <button key={p.id} className="uprofile-photo-thumb" onClick={() => setLightboxIndex(i)}>
                  <img src={`${API}${p.image_url}`} alt="" />
                </button>
              ))}
            </div>
            {photosTotal > photosPreview.length && (
              <button className="uprofile-section-more-btn" onClick={() => navigate(`/profile/${userId}/photos`)}>
                Voir plus
              </button>
            )}
          </div>
        )}

        {tripsPreview && tripsPreview.length > 0 && (
          <div className="uprofile-section">
            <div className="uprofile-section-header">
              <h2 className="uprofile-section-title">Trajets publics</h2>
              <span className="uprofile-section-count">{tripsTotal}</span>
            </div>
            <div className="uprofile-trips-grid">
              {tripsPreview.map(t => (
                <a key={t.id} className="uprofile-trip-card" href={`/trips/${t.id}/public`} target="_blank" rel="noopener noreferrer">
                  <div className="uprofile-trip-cover">
                    {t.cover_photo_url
                      ? <img src={`${API}${t.cover_photo_url}`} alt="" />
                      : <span className="uprofile-trip-cover-placeholder" />}
                  </div>
                  <span className="uprofile-trip-name">{t.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightboxIndex !== null && photosPreview && (
        <ImageLightbox
          images={photosPreview.map(p => `${API}${p.image_url}`)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          captions={photosPreview.map(p => p.caption)}
          subtitles={photosPreview.map(p => p.trip_name ? `Trajet : ${p.trip_name}` : null)}
        />
      )}
    </div>
  );
}
