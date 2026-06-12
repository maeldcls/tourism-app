import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../css/Monument.css';
import ImageLightbox from '../components/ImageLightbox';
import { useMonumentImages } from '../hooks/useMonumentImages';


export default function Monument() {
  const { state }  = useLocation();
  const navigate   = useNavigate();
  const monument   = state?.monument;

  const [activeImg, setActiveImg]       = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Si on vient du sheet, les images sont déjà résolues et passées en state
  // Le hook les récupère depuis le cache → pas de double appel réseau
  const { images, loading } = useMonumentImages(monument);

  if (!monument) {
    return (
      <div className="monu-empty">
        <p>Aucun monument sélectionné.</p>
        <button onClick={() => navigate('/map')}>Retour à la carte</button>
      </div>
    );
  }

  const cat  = monument._cat || { color: '#2196f3', label: 'Monument' };
  const tags = monument.tags || {};

  const address = [tags['addr:housenumber'], tags['addr:street'], monument.city]
    .filter(Boolean).join(' ');

  const wikipedia = tags.wikipedia
    ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(tags.wikipedia.replace(/^fr:/, ''))}`
    : null;

  const wikimediaCommons = tags.wikimedia_commons
    ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(tags.wikimedia_commons)}`
    : null;

  return (
    <>
      <div className="monu-page">
        <button className="monu-back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Retour
        </button>

        {/* Image principale */}
        {loading && (
          <div className="monu-image-wrap monu-image-wrap--skeleton" />
        )}
        {!loading && images.length > 0 && (
          <div className="monu-image-wrap">
            <img
              src={images[activeImg]}
              alt={monument.name}
              className="monu-image monu-image--clickable"
              onClick={() => setLightboxIndex(activeImg)}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div className="monu-image-zoom-hint">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                <path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/>
              </svg>
            </div>
            {images.length > 1 && (
              <div className="monu-image-dots">
                {images.map((_, i) => (
                  <button
                    key={i}
                    className={`monu-image-dot${i === activeImg ? ' monu-image-dot--active' : ''}`}
                    onClick={() => setActiveImg(i)}
                    aria-label={`Image ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Strip de thumbnails */}
        {!loading && images.length > 1 && (
          <div className="monu-thumbnails">
            {images.map((url, i) => (
              <button
                key={i}
                className={`monu-thumb${i === activeImg ? ' monu-thumb--active' : ''}`}
                onClick={() => { setActiveImg(i); setLightboxIndex(i); }}
                aria-label={`Photo ${i + 1}`}
              >
                <img
                  src={url}
                  alt=""
                  onError={e => { e.target.closest('.monu-thumb').style.display = 'none'; }}
                />
              </button>
            ))}
          </div>
        )}

        {/* En-tête */}
        <div className="monu-header">
          <span className="monu-badge" style={{ background: cat.color }}>{cat.label}</span>
          <h1 className="monu-title">{monument.name}</h1>
          {address && <p className="monu-address">{address}</p>}
        </div>

        {/* Description */}
        {(monument.description || tags.description) && (
          <p className="monu-description">{monument.description || tags.description}</p>
        )}

        {/* Infos clés */}
        <div className="monu-infos">
          {tags['opening_hours'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Horaires</span>
              <span>{tags['opening_hours']}</span>
            </div>
          )}
          {tags['fee'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Entrée</span>
              <span>{tags['fee'] === 'yes' ? 'Payante' : tags['fee'] === 'no' ? 'Gratuite' : tags['fee']}</span>
            </div>
          )}
          {tags['wheelchair'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Accessibilité PMR</span>
              <span>
                {tags['wheelchair'] === 'yes' ? 'Oui' :
                 tags['wheelchair'] === 'no'  ? 'Non' :
                 tags['wheelchair'] === 'limited' ? 'Partielle' : tags['wheelchair']}
              </span>
            </div>
          )}
          {(tags['phone'] || tags['contact:phone']) && (
            <div className="monu-info-row">
              <span className="monu-info-label">Téléphone</span>
              <a href={`tel:${tags['phone'] || tags['contact:phone']}`}>
                {tags['phone'] || tags['contact:phone']}
              </a>
            </div>
          )}
          {tags['architect'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Architecte</span>
              <span>{tags['architect']}</span>
            </div>
          )}
          {tags['start_date'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Construction</span>
              <span>{tags['start_date']}</span>
            </div>
          )}
          {tags['heritage'] && (
            <div className="monu-info-row">
              <span className="monu-info-label">Classement</span>
              <span>Patrimoine niveau {tags['heritage']}</span>
            </div>
          )}
          <div className="monu-info-row">
            <span className="monu-info-label">Coordonnées</span>
            <span className="monu-coords">
              {monument.latitude?.toFixed(5)}, {monument.longitude?.toFixed(5)}
            </span>
          </div>
        </div>

        {/* Liens externes */}
        {(tags.website || wikipedia || wikimediaCommons) && (
          <div className="monu-links">
            {tags.website && (
              <a className="monu-link" href={tags.website} target="_blank" rel="noreferrer">
                Site officiel
              </a>
            )}
            {wikipedia && (
              <a className="monu-link monu-link--wiki" href={wikipedia} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            )}
            {wikimediaCommons && (
              <a className="monu-link monu-link--commons" href={wikimediaCommons} target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
            )}
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={i => { setActiveImg(i); setLightboxIndex(i); }}
        />
      )}
    </>
  );
}
