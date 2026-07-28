import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/NotificationBell.css';

const API = API_URL;

export default function NotificationBell() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
  }, [token]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function fetchNotifications() {
    if (!token) return;
    fetch(`${API}/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setItems(data.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function respond(item, action) {
    setWorking(item.id);
    try {
      const url = item.type === 'trip_invite'
        ? `${API}/trips/${item.trip.id}/collaborators/${item.id}/${action}`
        : `${API}/friends/requests/${item.id}/${action}`;
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setItems(prev => prev.filter(i => i.id !== item.id || i.type !== item.type));
    } finally {
      setWorking(null);
    }
  }

  const ROLE_LABEL = { read: 'lecture seule', write: 'lecture/écriture' };

  return (
    <div className="nbell" ref={containerRef}>
      <button className="nbell-btn" onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        {items.length > 0 && <span className="nbell-badge">{items.length}</span>}
      </button>

      {open && (
        <div className="nbell-panel">
          <div className="nbell-panel-title">Notifications</div>
          {loading ? (
            <div className="nbell-empty">Chargement…</div>
          ) : items.length === 0 ? (
            <div className="nbell-empty">Aucune notification</div>
          ) : (
            <ul className="nbell-list">
              {items.map(item => (
                <li key={`${item.type}-${item.id}`} className="nbell-item">
                  <div className="nbell-item-avatar">
                    {item.user.avatar_url ? (
                      <img src={`${API}${item.user.avatar_url}`} alt="" />
                    ) : (
                      item.user.username[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="nbell-item-body">
                    <span className="nbell-item-text">
                      {item.type === 'trip_invite' ? (
                        <>
                          <strong>{item.user.username}</strong> vous invite à collaborer sur « {item.trip.name} »
                          {' '}({ROLE_LABEL[item.role] || item.role})
                        </>
                      ) : (
                        <>
                          <strong>{item.user.username}</strong> souhaite être ami·e avec vous
                        </>
                      )}
                    </span>
                    <div className="nbell-item-actions">
                      <button
                        className="nbell-accept-btn"
                        disabled={working === item.id}
                        onClick={() => respond(item, 'accept')}
                      >
                        Accepter
                      </button>
                      <button
                        className="nbell-decline-btn"
                        disabled={working === item.id}
                        onClick={() => respond(item, 'decline')}
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
