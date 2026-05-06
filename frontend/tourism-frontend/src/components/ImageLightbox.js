import { useEffect, useCallback, useRef } from 'react';
import '../css/ImageLightbox.css';

export default function ImageLightbox({ images, index, onClose, onChange }) {
  const filmRef    = useRef(null);
  const activeRef  = useRef(null);

  const prev = useCallback(() => { if (index > 0) onChange(index - 1); }, [index, onChange]);
  const next = useCallback(() => { if (index < images.length - 1) onChange(index + 1); }, [index, images.length, onChange]);

  // Navigation clavier
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  // Scroll automatique du filmstrip vers la vignette active
  useEffect(() => {
    if (activeRef.current && filmRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [index]);

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Fermer">✕</button>

      {/* Image principale */}
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        {index > 0 && (
          <button className="lightbox-nav lightbox-nav--prev" onClick={prev} aria-label="Précédent">
            ‹
          </button>
        )}
        <img
          src={images[index]}
          alt=""
          className="lightbox-img"
          onError={e => { e.target.style.display = 'none'; }}
        />
        {index < images.length - 1 && (
          <button className="lightbox-nav lightbox-nav--next" onClick={next} aria-label="Suivant">
            ›
          </button>
        )}
      </div>

      {/* Compteur */}
      <div className="lightbox-counter">{index + 1} / {images.length}</div>

      {/* Filmstrip */}
      {images.length > 1 && (
        <div
          className="lightbox-filmstrip"
          ref={filmRef}
          onClick={e => e.stopPropagation()}
        >
          {images.map((url, i) => (
            <button
              key={i}
              ref={i === index ? activeRef : null}
              className={`lightbox-film-thumb${i === index ? ' lightbox-film-thumb--active' : ''}`}
              onClick={() => onChange(i)}
              aria-label={`Photo ${i + 1}`}
            >
              <img
                src={url}
                alt=""
                onError={e => { e.target.closest('.lightbox-film-thumb').style.display = 'none'; }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
