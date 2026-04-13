import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../css/Monument.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function Monument() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const monument  = state?.monument;

  const [dbImages, setDbImages] = useState([]);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!monument?.id) return;

    const body = {
      osm_id:             monument.id,
      name:               monument.name,
      city:               monument.tags?.['addr:city'] || monument.tags?.['addr:town'] || null,
      description:        monument.tags?.description || null,
      category:           monument.category || 'monument',
      latitude:           monument.latitude,
      longitude:          monument.longitude,
      wikimedia_commons:  monument.tags?.wikimedia_commons || null,
      wikipedia:          monument.tags?.wikipedia || null,
      image:              monument.tags?.image || null,
    };

    fetch(`${API}/monuments/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.images?.length) setDbImages(data.images);
      })
      .catch(() => {});
  }, [monument]);

  if (!monument) {
    return (
      <div className="monu-empty">
        <p>Aucun monument sélectionné.</p>
        <button onClick={() => navigate('/map')}>Retour à la carte</button>
      </div>
    );
  }

  const cat  = monument._cat;
  const tags = monument.tags || {};

  const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'] || tags['addr:town']]
    .filter(Boolean).join(' ');

  const wikipedia = tags.wikipedia
    ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(tags.wikipedia.replace(/^fr:/, ''))}`
    : null;

  const wikimediaImage = tags.wikimedia_commons
    ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(tags.wikimedia_commons)}`
    : null;

  // Images à afficher : celles en DB en priorité, sinon tag OSM direct
  const images = dbImages.length > 0
    ? dbImages
    : tags.image ? [tags.image] : [];

  return (
    <div className="monu-page">
      <button className="monu-back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Retour
      </button>

      {/* Images */}
      {images.length > 0 && (
        <div className="monu-image-wrap">
          <img
            src={images[activeImg]}
            alt={monument.name}
            className="monu-image"
            onError={e => { e.target.style.display = 'none'; }}
          />
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

      {/* En-tête */}
      <div className="monu-header">
        <span className="monu-badge" style={{ background: cat.color }}>{cat.label}</span>
        <h1 className="monu-title">{monument.name}</h1>
        {address && <p className="monu-address">{address}</p>}
      </div>

      {/* Description */}
      {tags.description && (
        <p className="monu-description">{tags.description}</p>
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
        {(tags['email'] || tags['contact:email']) && (
          <div className="monu-info-row">
            <span className="monu-info-label">Email</span>
            <a href={`mailto:${tags['email'] || tags['contact:email']}`}>
              {tags['email'] || tags['contact:email']}
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
        {tags['operator'] && (
          <div className="monu-info-row">
            <span className="monu-info-label">Opérateur</span>
            <span>{tags['operator']}</span>
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
          <span className="monu-coords">{monument.latitude?.toFixed(5)}, {monument.longitude?.toFixed(5)}</span>
        </div>
      </div>

      {/* Liens externes */}
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
        {wikimediaImage && (
          <a className="monu-link monu-link--commons" href={wikimediaImage} target="_blank" rel="noreferrer">
            Wikimedia Commons
          </a>
        )}
      </div>
    </div>
  );
}
