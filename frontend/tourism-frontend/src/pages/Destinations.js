import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import RecommendationCard from '../components/RecommendationCard';
import '../css/Destinations.css';

const API = 'http://localhost:8000';
const PAGE_SIZE = 10;

function useGeolocation() {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setPosition(null),
      { timeout: 8000 }
    );
  }, []);

  return position;
}

export default function Destinations() {
  const { user, token } = useAuth();
  const position = useGeolocation();

  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [topThemes, setTopThemes] = useState([]);
  const [hasHistory, setHasHistory] = useState(false);
  const [positionReady, setPositionReady] = useState(false);

  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  const fetchRecommendations = useCallback(async (currentOffset, replace = false) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;
    if (currentOffset === 0) setInitialLoading(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        user_id: user.id,
        offset: currentOffset,
        limit: PAGE_SIZE,
      });
      if (position) {
        params.set('lat', position.lat);
        params.set('lon', position.lon);
      }

      const resp = await fetch(`${API}/recommendations?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();

      setItems(prev => replace ? data.items : [...prev, ...data.items]);
      setHasMore(data.items.length === PAGE_SIZE);
      setTopThemes(data.top_user_themes ?? []);
      setHasHistory(data.has_history ?? false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoading(false);
    }
  }, [user, token, position]);

  // Chargement initial — attend que la position soit déterminée (ou timeout)
  useEffect(() => {
    if (!user) return;
    const timeout = setTimeout(() => setPositionReady(true), 3000);
    if (position !== undefined) {
      clearTimeout(timeout);
      setPositionReady(true);
    }
    return () => clearTimeout(timeout);
  }, [user, position]);

  useEffect(() => {
    if (!positionReady) return;
    setOffset(0);
    setItems([]);
    setHasMore(true);
    fetchRecommendations(0, true);
  }, [positionReady, fetchRecommendations]);

  // Infinite scroll avec IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          const nextOffset = offset + PAGE_SIZE;
          setOffset(nextOffset);
          fetchRecommendations(nextOffset);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [offset, hasMore, fetchRecommendations]);

  if (!user) {
    return (
      <div className="dest-page">
        <div className="dest-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <p>Connectez-vous pour voir vos recommandations personnalisées.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dest-page">
      <div className="dest-header">
        <div>
          <h1 className="dest-title">Découvrir</h1>
          <p className="dest-subtitle">
            {hasHistory
              ? 'Recommandations basées sur vos voyages'
              : 'Explorez de nouveaux lieux'}
          </p>
        </div>
        {position && (
          <span className="dest-location-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            À proximité
          </span>
        )}
      </div>

      {hasHistory && topThemes.length > 0 && (
        <div className="dest-taste-strip">
          <span className="dest-taste-label">Vos goûts</span>
          <div className="dest-taste-tags">
            {topThemes.map(theme => (
              <span key={theme} className="dest-taste-tag">{theme}</span>
            ))}
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="dest-loading-initial">
          <div className="dest-spinner" />
          <span>Analyse de vos préférences…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="dest-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
          </svg>
          <p>Aucun lieu trouvé pour le moment.</p>
          <span>Ajoutez des monuments à vos trajets pour affiner les recommandations.</span>
        </div>
      ) : (
        <>
          <div className="dest-section-label">
            {hasHistory ? 'Pour vous' : 'À explorer'}
          </div>

          <div className="dest-grid">
            {items.map(item => (
              <RecommendationCard key={item.id} monument={item} />
            ))}
          </div>

          <div ref={sentinelRef} className="dest-sentinel" />

          {loading && (
            <div className="dest-loading-more">
              <div className="dest-spinner dest-spinner--sm" />
              <span>Chargement…</span>
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <p className="dest-end">Vous avez tout exploré !</p>
          )}
        </>
      )}
    </div>
  );
}
