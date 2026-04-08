import { useNavigate } from 'react-router-dom';
import '../css/MonumentSheet.css';

export default function MonumentSheet({ monument, onClose }) {
  const navigate = useNavigate();

  if (!monument) return null;

  const cat = monument._cat;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        <div className="sheet-header">
          <span className="sheet-tag" style={{ background: cat.color }}>
            {cat.label}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <h2 className="sheet-title">{monument.name}</h2>

        {monument.tags?.['addr:city'] && (
          <div className="sheet-location">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {monument.tags['addr:city']}
          </div>
        )}

        {monument.tags?.description && (
          <p className="sheet-description">{monument.tags.description}</p>
        )}

        {monument.tags?.website && (
          <a className="sheet-website" href={monument.tags.website} target="_blank" rel="noreferrer">
            Voir le site
          </a>
        )}

        <div className="sheet-coords">
          {monument.latitude?.toFixed(5)}, {monument.longitude?.toFixed(5)}
        </div>

        <button
          className="sheet-detail"
          onClick={() => navigate('/monument', { state: { monument } })}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
          </svg>
          Voir les détails
        </button>

      </div>
    </>
  );
}
