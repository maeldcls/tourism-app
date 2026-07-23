import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/CommentsSection.css';

const API = API_URL;
const MAX_LENGTH = 2000;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CommentsSection({ monumentId }) {
  const { user, token } = useAuth();

  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [body, setBody]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice]     = useState(null); // { type: 'pending' | 'error', message }

  const fetchComments = useCallback(() => {
    setLoading(true);
    fetch(`${API}/monuments/${monumentId}/comments`)
      .then(r => r.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monumentId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setNotice(null);
    try {
      const r = await fetch(`${API}/monuments/${monumentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!r.ok) throw new Error();
      const created = await r.json();

      setBody('');
      if (created.status === 'visible') {
        setComments(prev => [created, ...prev]);
      } else {
        setNotice({
          type: 'pending',
          message: "Votre commentaire a été envoyé et est en attente de modération avant d'être visible publiquement.",
        });
      }
    } catch {
      setNotice({ type: 'error', message: "Erreur lors de l'envoi du commentaire." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId) {
    const previous = comments;
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      const r = await fetch(`${API}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
    } catch {
      setComments(previous);
    }
  }

  return (
    <div className="monu-section monu-comments">
      <h2 className="monu-section-title">
        Commentaires{comments.length > 0 && ` (${comments.length})`}
      </h2>

      {user ? (
        <form className="monu-comments-form" onSubmit={handleSubmit}>
          <textarea
            className="monu-comments-input"
            placeholder="Partagez votre expérience sur ce lieu…"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={2}
            disabled={submitting}
          />
          <button
            type="submit"
            className="monu-comments-submit"
            disabled={submitting || !body.trim()}
          >
            {submitting ? 'Envoi…' : 'Publier'}
          </button>
        </form>
      ) : (
        <p className="monu-comments-login-hint">Connectez-vous pour laisser un commentaire.</p>
      )}

      {notice && (
        <p className={`monu-comments-notice monu-comments-notice--${notice.type}`}>
          {notice.message}
        </p>
      )}

      {loading ? (
        <p className="monu-comments-empty">Chargement…</p>
      ) : comments.length === 0 ? (
        <p className="monu-comments-empty">Aucun commentaire pour l'instant. Soyez le premier !</p>
      ) : (
        <ul className="monu-comments-list">
          {comments.map(c => (
            <li key={c.id} className="monu-comments-item">
              <div className="monu-comments-item-head">
                <span className="monu-comments-author">{c.username || 'Utilisateur'}</span>
                <span className="monu-comments-date">{formatDate(c.created_at)}</span>
              </div>
              <p className="monu-comments-body">{c.body}</p>
              {user?.id === c.user_id && (
                <button
                  className="monu-comments-delete"
                  onClick={() => handleDelete(c.id)}
                  aria-label="Supprimer ce commentaire"
                >
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
