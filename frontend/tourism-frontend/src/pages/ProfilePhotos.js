import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../services/api';
import ImageLightbox from '../components/ImageLightbox';
import API_URL from '../config';
import '../css/ProfilePhotos.css';

const API = API_URL;
const PAGE_SIZE = 24;

// Galerie complète des photos postées par un utilisateur sur ses trajets, avec un
// tri "toutes" / "un trajet spécifique". Réutilise GET /profile/{id}/photos, qui
// applique déjà les règles de visibilité (profil privé, trajets non publics).
export default function ProfilePhotos() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [tripFilter, setTripFilter] = useState('all');
  const [tripOptions, setTripOptions] = useState([]); // [{id, name}]
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const filterRef = useRef('all');

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    const tripQuery = filterRef.current !== 'all' ? `&trip_id=${filterRef.current}` : '';
    apiFetch(`/profile/${userId}/photos?limit=${PAGE_SIZE}&offset=${offsetRef.current}${tripQuery}`)
      .then(r => {
        if (r.status === 403) { setForbidden(true); throw new Error(); }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => {
        setItems(prev => [...prev, ...data.items]);
        setTotal(data.total);
        setHasMore(data.has_more);
        offsetRef.current += data.items.length;
        if (filterRef.current === 'all') {
          setTripOptions(prev => {
            const seen = new Map(prev.map(t => [t.id, t.name]));
            for (const it of data.items) {
              if (it.trip_id != null && !seen.has(it.trip_id)) seen.set(it.trip_id, it.trip_name || `Trajet #${it.trip_id}`);
            }
            return Array.from(seen, ([id, name]) => ({ id, name }));
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [userId, hasMore]);

  useEffect(() => {
    filterRef.current = tripFilter;
    offsetRef.current = 0;
    setItems([]);
    setHasMore(true);
    setForbidden(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripFilter, userId]);

  useEffect(() => { loadMore(); }, [tripFilter, userId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="pphotos-page">
      <div className="pphotos-header">
        <button className="pphotos-back" onClick={() => navigate(-1)} aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h1>Photos{total > 0 ? ` (${total})` : ''}</h1>
      </div>

      {tripOptions.length > 0 && (
        <select
          className="pphotos-filter"
          value={tripFilter}
          onChange={e => setTripFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">Tous les trajets</option>
          {tripOptions.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      {forbidden && <p className="pphotos-empty">Ce profil est privé.</p>}

      {!forbidden && !loading && items.length === 0 && (
        <p className="pphotos-empty">Aucune photo pour l'instant.</p>
      )}

      {!forbidden && (
        <div className="pphotos-grid">
          {items.map((p, i) => (
            <button key={p.id} className="pphotos-thumb" onClick={() => setLightboxIndex(i)}>
              <img src={`${API}${p.image_url}`} alt="" />
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="pphotos-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pphotos-skeleton" />
          ))}
        </div>
      )}

      {!loading && hasMore && !forbidden && <div ref={sentinelRef} className="pphotos-sentinel" />}

      {lightboxIndex !== null && (
        <ImageLightbox
          images={items.map(p => `${API}${p.image_url}`)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
          captions={items.map(p => p.caption)}
          subtitles={items.map(p => p.trip_name ? `Trajet : ${p.trip_name}` : null)}
        />
      )}
    </div>
  );
}
