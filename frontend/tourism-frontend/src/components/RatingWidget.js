import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/RatingWidget.css';

const API = API_URL;

function ScoreBadge({ label, score }) {
  const noScore = score.percent == null;
  return (
    <div className={`rating-score${noScore ? ' rating-score--empty' : ''}`}>
      <span className="rating-score-label">{label}</span>
      {noScore ? (
        <span className="rating-score-text">Pas assez d'avis</span>
      ) : (
        <>
          <span className="rating-score-percent">{score.percent}%</span>
          <span className="rating-score-text">{score.label}</span>
        </>
      )}
      <span className="rating-score-count">
        {score.total} avis
      </span>
    </div>
  );
}

export default function RatingWidget({ monumentId }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [voting, setVoting] = useState(false);

  const fetchRating = useCallback(() => {
    fetch(`${API}/monuments/${monumentId}/rating`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [monumentId, token]);

  useEffect(() => { fetchRating(); }, [fetchRating]);

  async function vote(isPositive) {
    if (!user) { navigate('/login'); return; }
    if (voting) return;

    setVoting(true);
    try {
      const r = await fetch(`${API}/monuments/${monumentId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_positive: isPositive }),
      });
      if (!r.ok) throw new Error();
      fetchRating();
    } catch {
      // on laisse l'état précédent, l'utilisateur peut réessayer
    } finally {
      setVoting(false);
    }
  }

  if (!data) return null;

  return (
    <div className="monu-section rating-widget">
      <h2 className="monu-section-title">Avis</h2>

      <div className="rating-scores">
        <ScoreBadge label="Note globale" score={data.global} />
        <ScoreBadge label="30 derniers jours" score={data.recent} />
      </div>

      <div className="rating-vote-buttons">
        <button
          className={`rating-vote-btn rating-vote-btn--up${data.user_vote === true ? ' rating-vote-btn--active' : ''}`}
          onClick={() => vote(true)}
          disabled={voting}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z" />
          </svg>
          Je recommande
        </button>
        <button
          className={`rating-vote-btn rating-vote-btn--down${data.user_vote === false ? ' rating-vote-btn--active' : ''}`}
          onClick={() => vote(false)}
          disabled={voting}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
          </svg>
          Je ne recommande pas
        </button>
      </div>

      {!user && (
        <p className="rating-login-hint">Connectez-vous pour voter.</p>
      )}
    </div>
  );
}
