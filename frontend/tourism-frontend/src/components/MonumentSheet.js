import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/MonumentSheet.css';
import ImageLightbox from './ImageLightbox';
import { useMonumentImages } from '../hooks/useMonumentImages';

const MAX_VISIBLE_THUMBS = 4;

export default function MonumentSheet({ monument, onClose }) {
  const navigate = useNavigate();
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const { images, loading } = useMonumentImages(monument);

  if (!monument) return null;

  const cat          = monument._cat;
  const visibleImgs  = images.slice(0, MAX_VISIBLE_THUMBS);
  const extraCount   = images.length - MAX_VISIBLE_THUMBS;

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

        {monument.city && (
          <div className="sheet-location">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {monument.city}
          </div>
        )}

        {/* Thumbnails */}
        {loading && (
          <div className="sheet-thumbnails">
            {[1, 2, 3].map(i => <div key={i} className="sheet-thumb sheet-thumb--skeleton" />)}
          </div>
        )}

        {!loading && images.length > 0 && (
          <div className="sheet-thumbnails">
            {visibleImgs.map((url, i) => (
              <button
                key={i}
                className="sheet-thumb"
                onClick={() => setLightboxIndex(i)}
                aria-label={`Photo ${i + 1}`}
              >
                <img
                  src={url}
                  alt=""
                  onError={e => { e.target.closest('.sheet-thumb').style.display = 'none'; }}
                />
              </button>
            ))}

            {extraCount > 0 && (
              <button
                className="sheet-thumb sheet-thumb--more"
                onClick={() => setLightboxIndex(MAX_VISIBLE_THUMBS)}
                aria-label={`Voir ${extraCount} photos de plus`}
              >
                +{extraCount}
              </button>
            )}
          </div>
        )}

        {monument.description && (
          <p className="sheet-description">{monument.description}</p>
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

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}
    </>
  );
}
