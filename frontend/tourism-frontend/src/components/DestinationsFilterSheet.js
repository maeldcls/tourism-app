import '../css/DestinationsFilterSheet.css';

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

export default function DestinationsFilterSheet({ radiusKm, onChange, onClose, centerLabel }) {
  return (
    <>
      <div className="dfs-backdrop" onClick={onClose} />
      <div className="dfs-dialog" role="dialog" aria-modal="true">
        <div className="dfs-header">
          <h3>Filtres</h3>
          <button className="dfs-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="dfs-section-label">Distance</div>
        {centerLabel ? (
          <p className="dfs-center-hint">Autour de {centerLabel}</p>
        ) : (
          <p className="dfs-center-hint dfs-center-hint--warn">
            Recherchez une ville ou autorisez la géolocalisation pour activer ce filtre.
          </p>
        )}

        <div className="dfs-chips">
          <button
            className={`dfs-chip ${radiusKm === null ? 'dfs-chip--active' : ''}`}
            onClick={() => onChange(null)}
          >
            Aucune limite
          </button>
          {RADIUS_OPTIONS.map(km => (
            <button
              key={km}
              className={`dfs-chip ${radiusKm === km ? 'dfs-chip--active' : ''}`}
              onClick={() => onChange(km)}
              disabled={!centerLabel}
            >
              {km} km
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
