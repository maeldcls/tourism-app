import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import API_URL from '../config';
import '../css/Friends.css';

const API = API_URL;

function Avatar({ user }) {
  return (
    <div className="frn-avatar">
      {user.avatar_url ? <img src={`${API}${user.avatar_url}`} alt="" /> : user.username[0]?.toUpperCase()}
    </div>
  );
}

export default function Friends() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const [code, setCode] = useState('');
  const [codeResult, setCodeResult] = useState(null);
  const [codeError, setCodeError] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);

  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        apiFetch('/friends'),
        apiFetch('/friends/requests'),
      ]);
      if (!friendsRes.ok || !requestsRes.ok) throw new Error();
      const [friendsData, requestsData] = await Promise.all([friendsRes.json(), requestsRes.json()]);
      setFriends(Array.isArray(friendsData) ? friendsData : []);
      setRequests(requestsData || { incoming: [], outgoing: [] });
    } catch {
      setLoadError('Impossible de charger vos amis pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      apiFetch(`/friends/search?q=${encodeURIComponent(query.trim())}`)
        .then(r => (r.ok ? r.json() : []))
        .then(data => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  async function sendRequest(userId, onDone) {
    setWorking(userId);
    setActionError(null);
    try {
      const r = await apiFetch('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      });
      if (!r.ok) throw new Error();
      onDone?.();
      loadAll();
    } catch {
      setActionError("Impossible d'envoyer la demande.");
    } finally {
      setWorking(null);
    }
  }

  async function respondRequest(id, action) {
    setWorking(id);
    setActionError(null);
    try {
      const r = await apiFetch(`/friends/requests/${id}/${action}`, { method: 'POST' });
      if (!r.ok) throw new Error();
      loadAll();
    } catch {
      setActionError("Impossible de traiter cette demande.");
    } finally {
      setWorking(null);
    }
  }

  async function removeRelation(userId) {
    setWorking(userId);
    setActionError(null);
    try {
      const r = await apiFetch(`/friends/${userId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      loadAll();
    } catch {
      setActionError("Impossible de retirer cette relation.");
    } finally {
      setWorking(null);
    }
  }

  async function lookupCode() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCodeLoading(true);
    setCodeError(null);
    setCodeResult(null);
    try {
      const r = await apiFetch(`/friends/by-code/${encodeURIComponent(trimmed)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Introuvable');
      setCodeResult(data);
    } catch (e) {
      setCodeError(e.message);
    } finally {
      setCodeLoading(false);
    }
  }

  function relationButton(person, { onSent } = {}) {
    if (person.relation === 'friends') {
      return <span className="frn-badge frn-badge--friend">Ami·e</span>;
    }
    if (person.relation === 'pending_outgoing') {
      return <span className="frn-badge frn-badge--pending">Demande envoyée</span>;
    }
    if (person.relation === 'pending_incoming') {
      return <span className="frn-badge frn-badge--pending">Vous a envoyé une demande</span>;
    }
    return (
      <button
        className="frn-add-btn"
        disabled={working === person.id}
        onClick={() => sendRequest(person.id, onSent)}
      >
        Ajouter
      </button>
    );
  }

  return (
    <div className="friends-page">
      <div className="friends-header">
        <button className="friends-back" onClick={() => navigate('/profile')} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
          </svg>
        </button>
        <h1>Amis</h1>
      </div>

      {(loadError || actionError) && (
        <div className="friends-banner-error">{loadError || actionError}</div>
      )}

      <div className="friends-card">
        <div className="friends-section-label">Rechercher par pseudo</div>
        <input
          className="friends-input"
          placeholder="Nom d'utilisateur…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {searching && <div className="friends-hint">Recherche…</div>}
        {results.length > 0 && (
          <ul className="frn-list">
            {results.map(person => (
              <li key={person.id} className="frn-item">
                <button className="frn-item-main" onClick={() => navigate(`/profile/${person.id}`)}>
                  <Avatar user={person} />
                  <span className="frn-username">{person.username}</span>
                </button>
                {relationButton(person)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="friends-card">
        <div className="friends-section-label">Ajouter avec un code</div>
        <div className="friends-code-row">
          <input
            className="friends-input"
            placeholder="Ex : A3F9K2XQ"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && lookupCode()}
          />
          <button className="friends-code-btn" onClick={lookupCode} disabled={codeLoading || !code.trim()}>
            Rechercher
          </button>
        </div>
        {codeError && <p className="friends-error">{codeError}</p>}
        {codeResult && (
          <ul className="frn-list">
            <li className="frn-item">
              <button className="frn-item-main" onClick={() => navigate(`/profile/${codeResult.id}`)}>
                <Avatar user={codeResult} />
                <span className="frn-username">{codeResult.username}</span>
              </button>
              {relationButton(codeResult, { onSent: () => setCodeResult(null) })}
            </li>
          </ul>
        )}
      </div>

      {requests.incoming.length > 0 && (
        <div className="friends-card">
          <div className="friends-section-label">Demandes reçues</div>
          <ul className="frn-list">
            {requests.incoming.map(req => (
              <li key={req.id} className="frn-item">
                <button className="frn-item-main" onClick={() => navigate(`/profile/${req.user.id}`)}>
                  <Avatar user={req.user} />
                  <span className="frn-username">{req.user.username}</span>
                </button>
                <div className="frn-request-actions">
                  <button
                    className="frn-accept-btn"
                    disabled={working === req.id}
                    onClick={() => respondRequest(req.id, 'accept')}
                  >
                    Accepter
                  </button>
                  <button
                    className="frn-decline-btn"
                    disabled={working === req.id}
                    onClick={() => respondRequest(req.id, 'decline')}
                  >
                    Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {requests.outgoing.length > 0 && (
        <div className="friends-card">
          <div className="friends-section-label">Demandes envoyées</div>
          <ul className="frn-list">
            {requests.outgoing.map(req => (
              <li key={req.id} className="frn-item">
                <button className="frn-item-main" onClick={() => navigate(`/profile/${req.user.id}`)}>
                  <Avatar user={req.user} />
                  <span className="frn-username">{req.user.username}</span>
                </button>
                <button
                  className="frn-cancel-btn"
                  disabled={working === req.user.id}
                  onClick={() => removeRelation(req.user.id)}
                >
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="friends-card">
        <div className="friends-section-label">Mes amis ({friends.length})</div>
        {loading ? (
          <div className="friends-hint">Chargement…</div>
        ) : friends.length === 0 ? (
          <p className="friends-empty">Vous n'avez pas encore d'amis. Utilisez la recherche ou un code pour en ajouter !</p>
        ) : (
          <ul className="frn-list">
            {friends.map(f => (
              <li key={f.id} className="frn-item">
                <button className="frn-item-main" onClick={() => navigate(`/profile/${f.id}`)}>
                  <Avatar user={f} />
                  <span className="frn-username">{f.username}</span>
                </button>
                <button className="frn-cancel-btn" disabled={working === f.id} onClick={() => removeRelation(f.id)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
