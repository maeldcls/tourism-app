import L from 'leaflet';

// ── Bibliothèque d'icônes pour les points personnalisés (style Google My Maps) ─
// Chaque entrée fournit un glyphe SVG (viewBox 24x24, dessiné en blanc sur le
// marqueur coloré) et une couleur par défaut si l'utilisateur n'en choisit pas.
export const ICON_LIBRARY = {
  pin: {
    label: 'Repère',
    glyph: null,
    color: '#1e3a5f',
  },
  restaurant: {
    label: 'Restaurant',
    glyph: '<path d="M11 9H9V2H7v7c0 1.66 1.34 3 3 3v9h2v-9c1.66 0 3-1.34 3-3V2h-2v7z"/>',
    color: '#e53935',
  },
  cafe: {
    label: 'Café',
    glyph: '<path d="M18 8h-1V5H5v9a3 3 0 003 3h6a3 3 0 003-3v-2h1a2 2 0 002-2V8a2 2 0 00-2-2zm0 4h-1V8h1v4zM4 19h14v2H4z"/>',
    color: '#8d6e63',
  },
  hotel: {
    label: 'Hôtel',
    glyph: '<path d="M7 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm11-4h-8v6H3V5H1v15h2v-3h18v3h2v-9c0-3.31-2.69-6-6-6z"/>',
    color: '#5e35b1',
  },
  park: {
    label: 'Parc / Nature',
    glyph: '<path d="M17 12h2L12 2 5 12h2l-4 6h7v4h4v-4h7z"/>',
    color: '#388e3c',
  },
  temple: {
    label: 'Temple / Site historique',
    glyph: '<path d="M12 3L2 9h20L12 3zM4 18h2v-7H4v7zm4 0h2v-7H8v7zm4 0h2v-7h-2v7zm4 0h2v-7h-2v7zM3 21h18v-2H3v2z"/>',
    color: '#fbc02d',
  },
  museum: {
    label: 'Musée',
    glyph: '<path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z"/>',
    color: '#7b1fa2',
  },
  viewpoint: {
    label: 'Point de vue',
    glyph: '<path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>',
    color: '#f57c00',
  },
  beach: {
    label: 'Plage',
    glyph: '<circle cx="12" cy="13" r="4"/><path d="M2 20h20v2H2z"/>',
    color: '#00acc1',
  },
  shopping: {
    label: 'Shopping',
    glyph: '<path d="M18 7h-2c0-2.21-1.79-4-4-4S8 4.79 8 7H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2z"/>',
    color: '#d81b60',
  },
  parking: {
    label: 'Parking',
    glyph: '<text x="12" y="17" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">P</text>',
    color: '#607d8b',
  },
};

export function defaultColorFor(iconKey) {
  return (ICON_LIBRARY[iconKey] || ICON_LIBRARY.pin).color;
}

// ── Marqueur générique pour les points de l'utilisateur (monuments-en-trajet +
// points personnalisés) — badge circulaire coloré, glyphe blanc, distinct des
// pins POI (teardrop) et affublé d'un check si le point est visité.
export function makePointIcon(iconKey, color, { visited = false, selected = false, orderNumber = null, other = false } = {}) {
  const def = ICON_LIBRARY[iconKey] || ICON_LIBRARY.pin;
  const fill = color || def.color;
  // Un peu plus grand quand un badge d'ordre est affiché (déborde du cercle sinon).
  const size = selected ? 34 : orderNumber != null ? 32 : 28;
  const cx = orderNumber != null ? 16 : 14;
  const viewSize = orderNumber != null ? 32 : 28;

  const glyph = def.glyph
    ? `<g transform="translate(${cx},13) scale(0.4) translate(-12,-12)" fill="#fff">${def.glyph}</g>`
    : `<circle cx="${cx}" cy="13" r="5" fill="#fff" opacity="0.9"/>`;

  const visitedBadge = visited
    ? `<circle cx="${cx + 8}" cy="20" r="6" fill="#fff"/>
       <path d="M${cx + 5.5} 20.2l1.8 1.8 3.2-3.6" stroke="#43a047" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';

  // Point public de quelqu'un d'autre (couche "publicPoints") — petit badge
  // "globe" au même emplacement que le badge visité (jamais les deux en même
  // temps : un point d'un autre utilisateur n'a pas de statut visité pour moi).
  const otherBadge = other
    ? `<circle cx="${cx + 8}" cy="20" r="6" fill="#fff"/>
       <circle cx="${cx + 8}" cy="20" r="4" fill="none" stroke="${fill}" stroke-width="1.1"/>
       <line x1="${cx + 4}" y1="20" x2="${cx + 12}" y2="20" stroke="${fill}" stroke-width="1"/>
       <ellipse cx="${cx + 8}" cy="20" rx="1.8" ry="4" fill="none" stroke="${fill}" stroke-width="1"/>`
    : '';

  // Badge numéroté (ordre de visite) — volontairement plus grand que le badge
  // "visité" pour que le chiffre reste lisible, positionné au coin opposé pour
  // ne jamais se superposer avec ce dernier.
  const orderBadge = orderNumber != null
    ? `<circle cx="${cx + 8}" cy="7" r="7" fill="#1e3a5f" stroke="#fff" stroke-width="2"/>
       <text x="${cx + 8}" y="10" font-size="9.5" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">${orderNumber}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="13" r="11" fill="${fill}" stroke="#fff" stroke-width="2.5" ${other ? 'stroke-dasharray="2.5,2"' : ''} opacity="${other ? 0.88 : 1}"/>
    ${glyph}
    ${visitedBadge}
    ${otherBadge}
    ${orderBadge}
  </svg>`;

  return L.divIcon({
    html: svg, className: '',
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 4)],
  });
}
