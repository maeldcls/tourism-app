import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/UserProfile.css';

const API = API_URL;

export default function UserProfile() {
  const { userId } = useParams();
  const { token, user: me } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [working, setWorking] = useState(false);

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
      </div>
    </div>
  );
}
