import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AddToTripDialog from './AddToTripDialog';
import { useMonumentImages } from '../hooks/useMonumentImages';

const THEME_COLORS = {
  musée:        { bg: '#e0f2fe', color: '#0369a1' },
  art:          { bg: '#fce7f3', color: '#9d174d' },
  antiquité:    { bg: '#fef9c3', color: '#854d0e' },
  architecture: { bg: '#f0fdf4', color: '#166534' },
  religion:     { bg: '#ede9fe', color: '#5b21b6' },
  nature:       { bg: '#dcfce7', color: '#15803d' },
  histoire:     { bg: '#fff7ed', color: '#9a3412' },
  moderne:      { bg: '#f0f9ff', color: '#0c4a6e' },
  médiéval:     { bg: '#fdf4ff', color: '#6b21a8' },
  militaire:    { bg: '#fef2f2', color: '#991b1b' },
  science:      { bg: '#ecfdf5', color: '#065f46' },
  château:      { bg: '#fffbeb', color: '#92400e' },
  spectacle:    { bg: '#fdf2f8', color: '#831843' },
  sport:        { bg: '#f0fdf4', color: '#14532d' },
  gastronomie:  { bg: '#fff7ed', color: '#7c2d12' },
};

const DEFAULT_THEME = { bg: '#f1f5f9', color: '#475569' };

export default function RecommendationCard({ monument }) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { images } = useMonumentImages(monument);

  const topThemes = monument.themes?.slice(0, 3) ?? [];
  const matchedSet = new Set(monument.matched_themes ?? []);
  const displayImage = monument.image_url || images[0];

  return (
    <>
      <div className="rec-card">
        <div className="rec-card-image">
          {displayImage ? (
            <img src={displayImage} alt={monument.name} loading="lazy" />
          ) : (
            <div className="rec-card-image-placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" opacity="0.25">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </div>
          )}
          {monument.distance_km != null && (
            <span className="rec-card-distance">{monument.distance_km} km</span>
          )}
        </div>

        <div className="rec-card-body">
          <div className="rec-card-meta">
            <h3 className="rec-card-name">{monument.name}</h3>
            {monument.city && <span className="rec-card-city">{monument.city}</span>}
          </div>

          {topThemes.length > 0 && (
            <div className="rec-card-themes">
              {topThemes.map(theme => {
                const isMatch = matchedSet.has(theme);
                const style = THEME_COLORS[theme] ?? DEFAULT_THEME;
                return (
                  <span
                    key={theme}
                    className={`rec-theme-badge ${isMatch ? 'rec-theme-badge--match' : ''}`}
                    style={{ background: style.bg, color: style.color }}
                  >
                    {isMatch && <span className="rec-theme-dot" style={{ background: style.color }} />}
                    {theme}
                  </span>
                );
              })}
            </div>
          )}

          <div className="rec-card-actions">
            <button
              className="rec-card-details-btn"
              onClick={() => navigate('/monument', { state: { monument } })}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L20.49 19l-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
              </svg>
              Détails
            </button>

            <button className="rec-card-add-btn" onClick={() => setDialogOpen(true)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Ajouter à un trajet
            </button>
          </div>
        </div>
      </div>

      {dialogOpen && (
        <AddToTripDialog
          monument={{ id: monument.id, name: monument.name }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
