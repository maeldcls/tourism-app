import { useNavigate } from 'react-router-dom';
import { useMonumentImages } from '../hooks/useMonumentImages';
import { getCategory } from '../utils/monumentCategories';
import API_URL from '../config';
import '../css/HomeMonumentTile.css';

// Carte compacte pour les rails horizontaux de la Home (thèmes, destinations en
// avant, recommandations) — volontairement plus légère que RecommendationCard
// (pas d'actions "Ajouter à un trajet"/"Détails"), pour démarquer visuellement
// Home de Destinations.
export default function HomeMonumentTile({ monument }) {
  const navigate = useNavigate();
  const { images } = useMonumentImages(monument);

  const rawImage = monument.image_url;
  const apiImage = rawImage?.startsWith('/') ? `${API_URL}${rawImage}` : rawImage;
  const displayImage = apiImage || images[0];
  const category = getCategory(monument.category);

  return (
    <button className="hmt-tile" onClick={() => navigate('/monument', { state: { monument } })}>
      <div className="hmt-image">
        {displayImage ? (
          <img src={displayImage} alt={monument.name} loading="lazy" />
        ) : (
          <div className="hmt-image-placeholder" style={{ color: category.color }}>
            <span>{category.icon}</span>
          </div>
        )}
        <span className="hmt-category-dot" style={{ background: category.color }} title={category.label} />
      </div>
      <div className="hmt-body">
        <span className="hmt-name">{monument.name}</span>
        {monument.city && <span className="hmt-city">{monument.city}</span>}
      </div>
    </button>
  );
}
