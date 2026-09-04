// Référentiel des catégories de monument, partagé entre MapPage (couleur des
// marqueurs) et Home (chips "Explorer par thème" → filtre sur Destinations).
export const CATEGORIES = {
  monument:   { color: '#f57c00', label: 'Monument',   icon: '🏛️' },
  musee:      { color: '#7b1fa2', label: 'Musée',      icon: '🖼️' },
  parc:       { color: '#388e3c', label: 'Parc',       icon: '🌳' },
  eglise:     { color: '#fbc02d', label: 'Église',     icon: '⛪' },
  nature:     { color: '#00897b', label: 'Nature',     icon: '🏞️' },
  restaurant: { color: '#e53935', label: 'Restaurant', icon: '🍽️' },
  autre:      { color: '#2196f3', label: 'Autre',      icon: '📍' },
};

export function getCategory(key) {
  return CATEGORIES[key] || CATEGORIES.autre;
}
