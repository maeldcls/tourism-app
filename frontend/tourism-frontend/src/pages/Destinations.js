import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import RecommendationCard from '../components/RecommendationCard';
import DestinationsSearchBar from '../components/DestinationsSearchBar';
import DestinationsFilterSheet from '../components/DestinationsFilterSheet';
import { CATEGORIES } from '../utils/monumentCategories';
import '../css/Destinations.css';

const API = API_URL;
const PAGE_SIZE = 10;

const TABS = [
  { mode: 'popular', label: 'Les plus populaires' },
  { mode: 'rated', label: 'Les mieux notés' },
  { mode: 'recommended', label: 'Mes recommandations' },
];

const MODE_COPY = {
  recommended: {
    sectionLabel: { withHistory: 'Pour vous', withoutHistory: 'À explorer' },
    subtitle: { withHistory: 'Recommandations basées sur vos voyages', withoutHistory: 'Explorez de nouveaux lieux' },
    empty: 'Ajoutez des monuments à vos trajets pour affiner les recommandations.',
  },
  popular: {
    sectionLabel: { withHistory: 'Populaires', withoutHistory: 'Populaires' },
    subtitle: { withHistory: 'Les lieux les plus ajoutés par la communauté', withoutHistory: 'Les lieux les plus ajoutés par la communauté' },
    empty: 'Aucun monument populaire pour le moment.',
  },
  rated: {
    sectionLabel: { withHistory: 'Mieux notés', withoutHistory: 'Mieux notés' },
    subtitle: { withHistory: 'Les mieux notés par la communauté', withoutHistory: 'Les mieux notés par la communauté' },
    empty: 'Aucun monument suffisamment noté pour le moment.',
  },
};

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
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState('recommended');
  const [city, setCity] = useState(null);
  const [radiusKm, setRadiusKm] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // Arrivée depuis un chip de thème sur la Home (?category=musee) — filtre
  // volontairement pas synchronisé dans l'URL ensuite, comme city/radiusKm.
  const [category, setCategory] = useState(() => searchParams.get('category'));

  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [topThemes, setTopThemes] = useState([]);
  const [hasHistory, setHasHistory] = useState(false);
  const [positionReady, setPositionReady] = useState(false);

  const [sentinelEl, setSentinelEl] = useState(null);
  const loadingRef = useRef(false);

  const center = useMemo(
    () => city ?? (position ? { lat: position.lat, lon: position.lon } : null),
    [city, position]
  );
  const centerLabel = city ? city.name : (position ? 'votre position' : null);

  const fetchRecommendations = useCallback(async (currentOffset, replace = false) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;
    if (currentOffset === 0) setInitialLoading(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        user_id: user.id,
        mode,
        offset: currentOffset,
        limit: PAGE_SIZE,
      });
      if (center) {
        params.set('lat', center.lat);
        params.set('lon', center.lon);
        if (radiusKm) params.set('max_km', radiusKm);
      }
      if (category) params.set('category', category);

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
  }, [user, token, mode, center, radiusKm, category]);

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
    if (!sentinelEl || !hasMore) return;
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
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, offset, hasMore, fetchRecommendations]);

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

  const copy = MODE_COPY[mode];
  const historyKey = hasHistory ? 'withHistory' : 'withoutHistory';

  return (
    <div className="dest-page">
      <div className="dest-sticky">
        <DestinationsSearchBar
          city={city}
          onSelectCity={setCity}
          onOpenFilter={() => setFilterOpen(true)}
          filterActive={radiusKm !== null}
        />
        <div className="dest-tabs">
          {TABS.map(tab => (
            <button
              key={tab.mode}
              className={`dest-tab ${mode === tab.mode ? 'dest-tab--active' : ''}`}
              onClick={() => setMode(tab.mode)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dest-header">
        <div>
          <h1 className="dest-title">Découvrir</h1>
          <p className="dest-subtitle">{copy.subtitle[historyKey]}</p>
        </div>
        <div className="dest-header-badges">
          {centerLabel && (
            <span className="dest-location-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              </svg>
              {city ? city.name : 'À proximité'}
            </span>
          )}
          {category && (
            <button className="dest-category-badge" onClick={() => setCategory(null)}>
              {CATEGORIES[category]?.icon} {CATEGORIES[category]?.label || category}
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {mode === 'recommended' && hasHistory && topThemes.length > 0 && (
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
          <span>Chargement…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="dest-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
          </svg>
          <p>Aucun lieu trouvé pour le moment.</p>
          <span>{copy.empty}</span>
        </div>
      ) : (
        <>
          <div className="dest-section-label">{copy.sectionLabel[historyKey]}</div>

          <div className="dest-grid">
            {items.map(item => (
              <RecommendationCard key={item.id} monument={item} />
            ))}
          </div>

          <div ref={setSentinelEl} className="dest-sentinel" />

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

      {filterOpen && (
        <DestinationsFilterSheet
          radiusKm={radiusKm}
          onChange={setRadiusKm}
          onClose={() => setFilterOpen(false)}
          centerLabel={centerLabel}
        />
      )}
    </div>
  );
}
