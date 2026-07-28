import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import VisitedMonumentCard from '../components/VisitedMonumentCard';
import API_URL from '../config';
import '../css/VisitedPlaces.css';

const API = API_URL;
const PAGE_SIZE = 20;

export default function VisitedPlaces() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadMore = useCallback(() => {
    if (!user || !token || loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    fetch(`${API}/visits/user/${user.id}?limit=${PAGE_SIZE}&offset=${offsetRef.current}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => {
        setItems(prev => [...prev, ...data.items]);
        setTotal(data.total);
        setHasMore(data.has_more);
        offsetRef.current += data.items.length;
      })
      .catch(() => setError("Impossible de charger les lieux visités."))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, hasMore]);

  // Premier chargement
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Infinite scroll : dès que la sentinelle en bas de liste devient visible, page suivante
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="vplaces-page">
      <div className="vplaces-header">
        <button className="vplaces-back" onClick={() => navigate(-1)} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h1>Lieux visités{total > 0 ? ` (${total})` : ''}</h1>
      </div>

      {error && <p className="vplaces-error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="vplaces-empty">Aucun lieu visité pour l'instant.</p>
      )}

      <div className="vplaces-grid">
        {items.map(v => (
          <VisitedMonumentCard key={v.visit_id} visit={v} />
        ))}
      </div>

      {loading && (
        <div className="vplaces-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="vplaces-skeleton" />
          ))}
        </div>
      )}

      {!loading && hasMore && <div ref={sentinelRef} className="vplaces-sentinel" />}
    </div>
  );
}
