import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';
import VisitedMonumentCard from '../components/VisitedMonumentCard';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import API_URL from '../config';
import '../css/Profile.css';

const API = API_URL;
const VISITED_PREVIEW_COUNT = 6;

export default function Profile() {
  const { user, token, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { canInstall, isIOSInstructions, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const [visitedPreview, setVisitedPreview] = useState([]);
  const [visitedTotal, setVisitedTotal] = useState(0);
  const [visitedLoading, setVisitedLoading] = useState(true);

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    fetch(`${API}/visits/user/${user.id}?limit=${VISITED_PREVIEW_COUNT}&offset=0`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setVisitedPreview(data.items);
        setVisitedTotal(data.total);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVisitedLoading(false); });
    return () => { cancelled = true; };
  }, [user, token]);

  if (!user) return <Navigate to="/login" replace />;

  const initials = user.username
    .split(/[\s_]/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || user.username[0].toUpperCase();

  const xpToNextLevel = 500 - (user.xp % 500);
  const levelProgress = Math.round(((user.xp % 500) / 500) * 100);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function submitPatch(formData) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API}/profile/me`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || 'Erreur lors de la mise à jour');
      updateUser(data);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    await submitPatch(formData);
    e.target.value = '';
  }

  async function handleUsernameSave() {
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === user.username) { setEditingUsername(false); return; }
    const formData = new FormData();
    formData.append('username', trimmed);
    const ok = await submitPatch(formData);
    if (ok) setEditingUsername(false);
  }

  async function handleTogglePublic() {
    const formData = new FormData();
    formData.append('is_public', String(!user.is_public));
    await submitPatch(formData);
  }

  async function handleInstall() {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  }

  function handleCopyCode() {
    navigator.clipboard?.writeText(user.friend_code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    });
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-topbar">
          <NotificationBell />
        </div>

        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            {user.avatar_url ? <img src={`${API}${user.avatar_url}`} alt="" /> : initials}
          </div>
          <button
            className="profile-avatar-edit-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            aria-label="Changer la photo de profil"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 20.94c1.5 0 2.75-1.25 2.75-2.75h-5.5c0 1.5 1.25 2.75 2.75 2.75zM19 12v-1.19c0-3.25-1.75-6.16-4.5-7.62V3c0-.83-.67-1.5-1.5-1.5S11.5 2.17 11.5 3v.19C8.75 4.65 7 7.55 7 10.81V12l-1.5 1.5V15h13v-1.5L19 12z" />
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>

        {editingUsername ? (
          <div className="profile-username-edit">
            <input
              className="profile-username-input"
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUsernameSave()}
              autoFocus
            />
            <button className="profile-username-save" onClick={handleUsernameSave} disabled={saving}>OK</button>
            <button
              className="profile-username-cancel"
              onClick={() => { setEditingUsername(false); setUsernameInput(user.username); }}
            >
              Annuler
            </button>
          </div>
        ) : (
          <h1 className="profile-username" onClick={() => setEditingUsername(true)}>
            {user.username}
            <svg className="profile-username-pencil" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </h1>
        )}
        <p className="profile-email">{user.email}</p>

        {error && <p className="profile-error">{error}</p>}

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-value">{user.level}</span>
            <span className="stat-label">Niveau</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="stat-value">{user.xp}</span>
            <span className="stat-label">XP total</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="stat-value">{xpToNextLevel}</span>
            <span className="stat-label">XP prochain niveau</span>
          </div>
        </div>

        <div className="profile-xp-bar">
          <div className="xp-bar-label">
            <span>Niveau {user.level}</span>
            <span>Niveau {user.level + 1}</span>
          </div>
          <div className="xp-bar-track">
            <div className="xp-bar-fill" style={{ width: `${levelProgress}%` }} />
          </div>
          <p className="xp-bar-pct">{levelProgress}%</p>
        </div>

        <div className="profile-visibility">
          <div className="profile-visibility-text">
            <span className="profile-visibility-title">Profil {user.is_public ? 'public' : 'privé'}</span>
            <span className="profile-visibility-desc">
              {user.is_public
                ? 'Tout le monde peut voir votre profil complet.'
                : 'Seuls votre nom et votre photo sont visibles par les autres.'}
            </span>
          </div>
          <button
            className={`profile-toggle${user.is_public ? ' profile-toggle--on' : ''}`}
            onClick={handleTogglePublic}
            disabled={saving}
            role="switch"
            aria-checked={user.is_public}
            aria-label="Basculer la visibilité du profil"
          >
            <span className="profile-toggle-knob" />
          </button>
        </div>

        {canInstall && (
          <button className="profile-install-btn" onClick={handleInstall} disabled={installing}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            {installing ? 'Installation…' : "Installer l'application"}
          </button>
        )}

        {isIOSInstructions && (
          <p className="profile-install-hint">
            Pour installer l'app : appuyez sur <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>.
          </p>
        )}

        <div className="profile-friend-code">
          <span className="profile-friend-code-label">Mon code ami</span>
          <div className="profile-friend-code-row">
            <span className="profile-friend-code-value">{user.friend_code}</span>
            <button className="profile-friend-code-copy" onClick={handleCopyCode}>
              {codeCopied ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </div>

        <button className="profile-friends-btn" onClick={() => navigate('/friends')}>
          Mes amis
        </button>

        <div className="profile-visited-section">
          <div className="profile-visited-header">
            <h2 className="profile-visited-title">Lieux visités</h2>
            {visitedTotal > 0 && <span className="profile-visited-count">{visitedTotal}</span>}
          </div>

          {visitedLoading && (
            <div className="profile-visited-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="profile-visited-skeleton" />
              ))}
            </div>
          )}

          {!visitedLoading && visitedPreview.length === 0 && (
            <p className="profile-visited-empty">
              Aucun lieu visité pour l'instant. Marquez un monument comme visité depuis sa page !
            </p>
          )}

          {!visitedLoading && visitedPreview.length > 0 && (
            <>
              <div className="profile-visited-grid">
                {visitedPreview.map(v => (
                  <VisitedMonumentCard key={v.visit_id} visit={v} />
                ))}
              </div>
              {visitedTotal > visitedPreview.length && (
                <button className="profile-visited-more-btn" onClick={() => navigate('/visited')}>
                  Voir plus
                </button>
              )}
            </>
          )}
        </div>

        <button className="profile-logout-btn" onClick={handleLogout}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
