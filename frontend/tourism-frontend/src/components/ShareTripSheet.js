import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import API_URL from '../config';
import '../css/ShareTripSheet.css';

const API = API_URL;

export default function ShareTripSheet({ trip, onClose }) {
  const { token } = useAuth();
  const [friends, setFriends] = useState([]);
  const [members, setMembers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rolePicks, setRolePicks] = useState({});
  const [inviting, setInviting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  function load() {
    setLoading(true);
    Promise.all([
      fetch(`${API}/friends`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${API}/trips/${trip.id}/collaborators`, { headers: authHeaders }).then(r => r.json()),
    ])
      .then(([friendsData, membersData]) => {
        setFriends(Array.isArray(friendsData) ? friendsData : []);
        setMembers(membersData);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`${API}/friends/search?q=${encodeURIComponent(q)}`, { headers: authHeaders })
        .then(r => r.json())
        .then(data => setSearchResults(Array.isArray(data) ? data : []))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const memberUserIds = new Set((members?.collaborators || []).map(c => c.user.id));
  const invitableFriends = friends.filter(f => !memberUserIds.has(f.id));
  const invitableResults = searchResults.filter(u => !memberUserIds.has(u.id) && !friends.some(f => f.id === u.id));

  async function invite(friendId) {
    setInviting(friendId);
    setError(null);
    try {
      const role = rolePicks[friendId] || 'read';
      const r = await fetch(`${API}/trips/${trip.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ user_id: friendId, role }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || 'Erreur');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setInviting(null);
    }
  }

  async function changeRole(collabId, role) {
    setMembers(prev => ({
      ...prev,
      collaborators: prev.collaborators.map(c => c.id === collabId ? { ...c, role } : c),
    }));
    await fetch(`${API}/trips/${trip.id}/collaborators/${collabId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ role }),
    });
  }

  async function removeMember(collabId) {
    setRemoving(collabId);
    try {
      const r = await fetch(`${API}/trips/${trip.id}/collaborators/${collabId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (r.ok) load();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <div className="shts-backdrop" onClick={onClose} />
      <div className="shts-sheet" role="dialog" aria-modal="true">
        <div className="shts-header">
          <h3>Partager « {trip.name} »</h3>
          <button className="shts-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {error && <div className="shts-error">{error}</div>}

        {loading ? (
          <div className="shts-loading"><div className="shts-spinner" />Chargement…</div>
        ) : (
          <>
            {members.collaborators.length > 0 && (
              <>
                <div className="shts-section-label">Membres</div>
                <ul className="shts-list">
                  {members.collaborators.map(c => (
                    <li key={c.id} className="shts-member">
                      <div className="shts-member-avatar">
                        {c.user.avatar_url ? <img src={`${API}${c.user.avatar_url}`} alt="" /> : c.user.username[0]?.toUpperCase()}
                      </div>
                      <div className="shts-member-info">
                        <span className="shts-member-name">{c.user.username}</span>
                        {c.status === 'pending' && <span className="shts-member-pending">Invitation en attente</span>}
                      </div>
                      <select
                        className="shts-role-select"
                        value={c.role}
                        onChange={e => changeRole(c.id, e.target.value)}
                      >
                        <option value="read">Lecture seule</option>
                        <option value="write">Lecture/écriture</option>
                      </select>
                      <button
                        className="shts-remove-btn"
                        disabled={removing === c.id}
                        onClick={() => setConfirmRemove(c)}
                        aria-label={`Retirer ${c.user.username}`}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="shts-section-label">Inviter un ami</div>
            {invitableFriends.length === 0 ? (
              <p className="shts-empty">
                {friends.length === 0
                  ? "Vous n'avez pas encore d'amis à inviter."
                  : 'Tous vos amis sont déjà membres de ce trajet.'}
              </p>
            ) : (
              <ul className="shts-list">
                {invitableFriends.map(f => (
                  <li key={f.id} className="shts-member">
                    <div className="shts-member-avatar">
                      {f.avatar_url ? <img src={`${API}${f.avatar_url}`} alt="" /> : f.username[0]?.toUpperCase()}
                    </div>
                    <span className="shts-member-name">{f.username}</span>
                    <select
                      className="shts-role-select"
                      value={rolePicks[f.id] || 'read'}
                      onChange={e => setRolePicks(prev => ({ ...prev, [f.id]: e.target.value }))}
                    >
                      <option value="read">Lecture seule</option>
                      <option value="write">Lecture/écriture</option>
                    </select>
                    <button
                      className="shts-invite-btn"
                      disabled={inviting === f.id}
                      onClick={() => invite(f.id)}
                    >
                      {inviting === f.id ? <div className="shts-btn-spinner" /> : 'Inviter'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="shts-section-label">Inviter quelqu'un d'autre</div>
            <input
              className="shts-search-input"
              type="text"
              placeholder="Rechercher par username…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searching && <div className="shts-loading"><div className="shts-spinner" />Recherche…</div>}
            {!searching && searchQuery.trim().length >= 2 && (
              invitableResults.length === 0 ? (
                <p className="shts-empty">Aucun utilisateur trouvé.</p>
              ) : (
                <ul className="shts-list">
                  {invitableResults.map(u => (
                    <li key={u.id} className="shts-member">
                      <div className="shts-member-avatar">
                        {u.avatar_url ? <img src={`${API}${u.avatar_url}`} alt="" /> : u.username[0]?.toUpperCase()}
                      </div>
                      <span className="shts-member-name">{u.username}</span>
                      <select
                        className="shts-role-select"
                        value={rolePicks[u.id] || 'read'}
                        onChange={e => setRolePicks(prev => ({ ...prev, [u.id]: e.target.value }))}
                      >
                        <option value="read">Lecture seule</option>
                        <option value="write">Lecture/écriture</option>
                      </select>
                      <button
                        className="shts-invite-btn"
                        disabled={inviting === u.id}
                        onClick={() => invite(u.id)}
                      >
                        {inviting === u.id ? <div className="shts-btn-spinner" /> : 'Inviter'}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title={confirmRemove ? `Retirer ${confirmRemove.user.username} ?` : ''}
        message="Cette personne perdra l'accès à ce trajet."
        confirmLabel="Retirer"
        onConfirm={async () => { const c = confirmRemove; setConfirmRemove(null); await removeMember(c.id); }}
        onCancel={() => setConfirmRemove(null)}
      />
    </>
  );
}
