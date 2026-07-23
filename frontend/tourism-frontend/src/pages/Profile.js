import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../css/Profile.css';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">{initials}</div>

        <h1 className="profile-username">{user.username}</h1>
        <p className="profile-email">{user.email}</p>

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

        {user.is_admin && (
          <button className="profile-admin-btn" onClick={() => navigate('/admin/comments')}>
            Modération des commentaires
          </button>
        )}

        <button className="profile-logout-btn" onClick={handleLogout}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
