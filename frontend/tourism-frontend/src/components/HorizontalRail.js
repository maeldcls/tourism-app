import { Link } from 'react-router-dom';
import '../css/HorizontalRail.css';

// Rail de défilement horizontal générique — utilisé pour les thèmes, chaque
// destination en avant et les recommandations sur la Home. C'est ce format
// "vitrine" (plutôt qu'une grille) qui démarque structurellement Home de la
// page Destinations.
export default function HorizontalRail({ title, subtitle, moreLink, moreLabel = 'Voir plus', children }) {
  return (
    <section className="hrail">
      {(title || moreLink) && (
        <div className="hrail-header">
          <div>
            {title && <h2 className="hrail-title">{title}</h2>}
            {subtitle && <p className="hrail-subtitle">{subtitle}</p>}
          </div>
          {moreLink && (
            <Link to={moreLink} className="hrail-more">
              {moreLabel}
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
              </svg>
            </Link>
          )}
        </div>
      )}
      <div className="hrail-scroller">{children}</div>
    </section>
  );
}
