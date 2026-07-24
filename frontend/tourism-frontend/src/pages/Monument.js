import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../css/Monument.css';
import ImageLightbox from '../components/ImageLightbox';
import AddToTripDialog from '../components/AddToTripDialog';
import CommentsSection from '../components/CommentsSection';
import RatingWidget from '../components/RatingWidget';
import MonumentTags from '../components/MonumentTags';
import { useMonumentImages } from '../hooks/useMonumentImages';

const MAX_VISIBLE_THUMBS = 3;

export default function Monument() {
  const { state }  = useLocation();
  const navigate   = useNavigate();
  const monument   = state?.monument;

  const [activeImg, setActiveImg]         = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showTripDialog, setShowTripDialog] = useState(false);
  const [visited, setVisited]             = useState(false);

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

  const visibleThumbs = images.slice(0, MAX_VISIBLE_THUMBS);
  const extraThumbs    = images.length - MAX_VISIBLE_THUMBS;

  return (
    <>
      <div className="monu-page">
        {/* Hero image */}
        <div className="monu-hero">
          {loading && <div className="monu-hero-img monu-hero-img--skeleton" />}

          {!loading && images.length > 0 && (
            <img
              src={images[activeImg]}
              alt={monument.name}
              className="monu-hero-img monu-hero-img--clickable"
              onClick={() => setLightboxIndex(activeImg)}
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}

          {!loading && images.length === 0 && (
            <div className="monu-hero-img monu-hero-img--placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </div>
          )}

          <button className="monu-back" onClick={() => navigate(-1)} aria-label="Retour">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>

          {!loading && images.length > 1 && (
            <div className="monu-thumb-strip">
              {visibleThumbs.map((url, i) => (
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
              {extraThumbs > 0 && (
                <button
                  className="monu-thumb monu-thumb--more"
                  onClick={() => setLightboxIndex(MAX_VISIBLE_THUMBS)}
                  aria-label={`Voir ${extraThumbs} photos de plus`}
                >
                  +{extraThumbs}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Carte de contenu */}
        <div className="monu-card">
          <span className="monu-badge" style={{ background: cat.color }}>{cat.label}</span>

          <div className="monu-title-row">
            <h1 className="monu-title">{monument.name}</h1>
            {monument.rating && (
              <span className="monu-rating">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                  <path d="M12 2.5l2.9 6.5 7.1.6-5.4 4.7 1.7 6.9L12 17.3 5.7 21.2l1.7-6.9-5.4-4.7 7.1-.6z" />
                </svg>
                {monument.rating.toFixed(1)}
                {monument.ratingCount && <span className="monu-rating-count">({monument.ratingCount.toLocaleString('fr-FR')} avis)</span>}
              </span>
            )}
          </div>

          <div className="monu-meta-row">
            {(address || monument.city) && (
              <span className="monu-place">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                {address || monument.city}
              </span>
            )}
            <button className="monu-map-link" onClick={() => navigate('/map', { state: { monument } })}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
              </svg>
              Voir sur la carte
            </button>
          </div>

          {(monument.description || tags.description) && (
            <div className="monu-section">
              <h2 className="monu-section-title">Description</h2>
              <p className="monu-description">{monument.description || tags.description}</p>
            </div>
          )}

          <div className="monu-actions">
            <button
              className={`monu-visit-btn${visited ? ' monu-visit-btn--active' : ''}`}
              onClick={() => setVisited(v => !v)}
            >
              {visited ? 'Lieu visité ✓' : "J'ai visité ce lieu"}
            </button>
            <button
              className="monu-add-btn"
              onClick={() => setShowTripDialog(true)}
              aria-label="Ajouter à un trajet"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          </div>

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

          <RatingWidget monumentId={monument.id} />

          <MonumentTags monumentId={monument.id} />

          <CommentsSection monumentId={monument.id} />
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={i => { setActiveImg(i); setLightboxIndex(i); }}
        />
      )}

      {showTripDialog && (
        <AddToTripDialog
          monument={monument}
          onClose={() => setShowTripDialog(false)}
        />
      )}
    </>
  );
}
