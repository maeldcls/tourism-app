import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/AdminComments.css';
import '../css/AdminPhotos.css';

const API = API_URL;

const TABS = [
  { key: 'pending',  label: 'En attente' },
  { key: 'approved', label: 'Validées' },
  { key: 'rejected', label: 'Rejetées' },
];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function resolveUrl(url) {
  return url.startsWith('/') ? `${API}${url}` : url;
}

export default function AdminPhotos() {
  const { user, token } = useAuth();

  const [status, setStatus]   = useState('pending');
  const [photos, setPhotos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const fetchQueue = useCallback((s) => {
    setLoading(true);
    fetch(`${API}/admin/photos?status=${s}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setPhotos(Array.isArray(data) ? data : []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (user?.is_admin) fetchQueue(status);
  }, [user, status, fetchQueue]);

  async function act(photoId, action) {
    setBusyId(photoId);
    try {
      const r = await fetch(`${API}/admin/photos/${photoId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch {
      // laisse l'entrée en place, l'admin peut réessayer
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!user.is_admin) {
    return (
      <div className="admin-page">
        <div className="admin-denied">
          <p>Accès réservé aux administrateurs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1 className="admin-title">Modération des photos</h1>
      <p className="admin-subtitle">Photos proposées par les utilisateurs pour enrichir les fiches monuments.</p>

      <div className="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`admin-tab${status === t.key ? ' admin-tab--active' : ''}`}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="admin-empty">Chargement…</p>
      ) : photos.length === 0 ? (
        <p className="admin-empty">Rien à afficher ici.</p>
      ) : (
        <ul className="admin-photo-grid">
          {photos.map(p => (
            <li key={p.id} className="admin-photo-card">
              <img className="admin-photo-img" src={resolveUrl(p.image_url)} alt="" />
              <div className="admin-photo-info">
                <span className="admin-card-monument">{p.monument_name || `Monument #${p.monument_id}`}</span>
                <span className="admin-card-meta">
                  {p.submitter_username || 'Utilisateur'} · {formatDate(p.created_at)}
                </span>
              </div>
              <div className="admin-card-actions">
                {status !== 'approved' && (
                  <button
                    className="admin-btn admin-btn--restore"
                    onClick={() => act(p.id, 'approve')}
                    disabled={busyId === p.id}
                  >
                    Valider
                  </button>
                )}
                {status !== 'rejected' && (
                  <button
                    className="admin-btn admin-btn--remove"
                    onClick={() => act(p.id, 'reject')}
                    disabled={busyId === p.id}
                  >
                    Rejeter
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
