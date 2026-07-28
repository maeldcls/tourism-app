import { useNavigate } from 'react-router-dom';
import { useMonumentImages } from '../hooks/useMonumentImages';
import '../css/VisitedMonumentCard.css';

function formatVisitedAt(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function VisitedMonumentCard({ visit }) {
  const navigate = useNavigate();
  const monumentForImages = {
    id: visit.monument_id,
    name: visit.monument_name,
    latitude: visit.latitude,
    longitude: visit.longitude,
  };
  const { images, loading } = useMonumentImages(monumentForImages);

  function handleClick() {
    navigate('/monument', {
      state: {
        monument: {
          id: visit.monument_id,
          name: visit.monument_name,
          city: visit.city,
          latitude: visit.latitude,
          longitude: visit.longitude,
          category: visit.category,
        },
      },
    });
  }

  return (
    <button className="vmc-card" onClick={handleClick}>
      <div className="vmc-thumb">
        {loading && <div className="vmc-thumb-skeleton" />}
        {!loading && images.length > 0 && (
          <img src={images[0]} alt="" onError={e => { e.target.style.display = 'none'; }} />
        )}
        {!loading && images.length === 0 && (
          <div className="vmc-thumb-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        )}
        {visit.user_rating != null && (
          <div className={`vmc-rating-badge${visit.user_rating ? ' vmc-rating-badge--positive' : ' vmc-rating-badge--negative'}`}>
            {visit.user_rating ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                <path d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="vmc-info">
        <span className="vmc-name">{visit.monument_name || 'Monument'}</span>
        {visit.city && <span className="vmc-city">{visit.city}</span>}
        {visit.visited_at && <span className="vmc-date">Visité le {formatVisitedAt(visit.visited_at)}</span>}
      </div>
    </button>
  );
}
