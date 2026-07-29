import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminNav from '../components/AdminNav';
import API_URL from '../config';
import '../css/AdminComments.css';

const API = API_URL;

const TABS = [
  { key: 'pending_review', label: 'En attente' },
  { key: 'visible',        label: 'Visibles' },
  { key: 'removed',        label: 'Supprimés' },
];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminComments() {
  const { user, token } = useAuth();

  const [status, setStatus]   = useState('pending_review');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const fetchQueue = useCallback((s) => {
    setLoading(true);
    fetch(`${API}/admin/comments?status=${s}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (user?.is_admin) fetchQueue(status);
  }, [user, status, fetchQueue]);

  async function act(commentId, action) {
    setBusyId(commentId);
    try {
      const r = await fetch(`${API}/admin/comments/${commentId}${action === 'restore' ? '/restore' : ''}`, {
        method: action === 'restore' ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      setComments(prev => prev.filter(c => c.id !== commentId));
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
      <AdminNav />
      <h1 className="admin-title">Modération des commentaires</h1>
      <p className="admin-subtitle">Contenus signalés par le filtre IA ou déjà traités.</p>

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
      ) : comments.length === 0 ? (
        <p className="admin-empty">Rien à afficher ici.</p>
      ) : (
        <ul className="admin-list">
          {comments.map(c => (
            <li key={c.id} className="admin-card">
              <div className="admin-card-head">
                <div>
                  <span className="admin-card-monument">{c.monument_name || `Monument #${c.monument_id}`}</span>
                  <span className="admin-card-meta">
                    {c.username || 'Utilisateur'} · {formatDate(c.created_at)}
                  </span>
                </div>
                {c.ai_score != null && (
                  <span className="admin-card-score" title="Score de toxicité IA">
                    {Math.round(c.ai_score * 100)}%
                  </span>
                )}
              </div>

              <p className="admin-card-body">{c.body}</p>

              <div className="admin-card-actions">
                {status !== 'visible' && (
                  <button
                    className="admin-btn admin-btn--restore"
                    onClick={() => act(c.id, 'restore')}
                    disabled={busyId === c.id}
                  >
                    Réafficher
                  </button>
                )}
                {status !== 'removed' && (
                  <button
                    className="admin-btn admin-btn--remove"
                    onClick={() => act(c.id, 'remove')}
                    disabled={busyId === c.id}
                  >
                    Supprimer
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
