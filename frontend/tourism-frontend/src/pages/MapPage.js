import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapPage.css';
import MonumentSheet from '../components/MonumentSheet';

// ── Constantes ────────────────────────────────────────────────────────────────
const MIN_ZOOM  = 13;   // en dessous → pas de chargement
const CELL_DEG  = 0.025; // ~2.5 km par cellule de grille
const DEFAULT_CENTER = [48.8566, 2.3522];
const DEFAULT_ZOOM   = 15;

// ── Persistance de la position ────────────────────────────────────────────────
const POS_KEY = 'map_last_pos';

function loadSavedPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw); // { center: [lat, lng], zoom }
  } catch {}
  return null;
}

function savePos(lat, lng, zoom) {
  localStorage.setItem(POS_KEY, JSON.stringify({ center: [lat, lng], zoom }));
}

// ── Catégories OSM ────────────────────────────────────────────────────────────
const CATEGORIES = {
  monument:   { color: '#f57c00', label: 'Monument'   },
  musee:      { color: '#7b1fa2', label: 'Musée'      },
  parc:       { color: '#388e3c', label: 'Parc'       },
  eglise:     { color: '#fbc02d', label: 'Église'     },
  nature:     { color: '#00897b', label: 'Nature'     },
  restaurant: { color: '#e53935', label: 'Restaurant' },
  autre:      { color: '#2196f3', label: 'Autre'      },
};

function osmTagsToCategory(tags) {
  if (!tags) return 'autre';
  const { tourism, amenity, leisure, historic, natural } = tags;
  if (tourism === 'museum')                                        return 'musee';
  if (tourism === 'attraction' || historic)                        return 'monument';
  if (amenity === 'place_of_worship')                              return 'eglise';
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'bar') return 'restaurant';
  if (leisure === 'park' || leisure === 'garden')                  return 'parc';
  if (natural)                                                     return 'nature';
  if (tourism)                                                     return 'monument';
  return 'autre';
}

function getCategory(key) {
  return CATEGORIES[key] || CATEGORIES.autre;
}

function makeIcon(color, selected = false) {
  const size = selected ? 32 : 24;
  const h    = selected ? 48 : 36;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${h}">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.5 12 24 12 24S24 20.5 24 12C24 5.37 18.63 0 12 0z"
      fill="${color}" stroke="#fff" stroke-width="${selected ? 2 : 1.5}"/>
    <circle cx="12" cy="12" r="5" fill="#fff" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg, className: '',
    iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -(h + 2)],
  });
}

// ── Grille de tuiles ──────────────────────────────────────────────────────────
function cellBoundsFromKey(key) {
  const [r, c] = key.split('_').map(Number);
  return {
    south: r * CELL_DEG, north: (r + 1) * CELL_DEG,
    west:  c * CELL_DEG, east:  (c + 1) * CELL_DEG,
  };
}

function cellsInBounds({ south, west, north, east }) {
  const cells = [];
  const minR = Math.floor(south / CELL_DEG);
  const maxR = Math.floor(north / CELL_DEG);
  const minC = Math.floor(west  / CELL_DEG);
  const maxC = Math.floor(east  / CELL_DEG);
  for (let r = minR; r <= maxR; r++)
    for (let c = minC; c <= maxC; c++)
      cells.push(`${r}_${c}`);
  return cells;
}

// ── Requête Overpass sur une bbox ─────────────────────────────────────────────
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOverpassBbox(south, west, north, east) {
  const query = `
    [out:json][timeout:30][bbox:${south},${west},${north},${east}];
    (
      node["tourism"~"attraction|museum|artwork|viewpoint"];
      node["historic"~"monument|memorial|castle|ruins"];
      node["leisure"~"park|garden"];
      node["amenity"="place_of_worship"];
    );
    out body 100;
  `;

  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: query,
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.elements
        .filter(e => e.tags?.name)
        .map(e => ({
          id:        e.id,
          name:      e.tags.name,
          latitude:  e.lat,
          longitude: e.lon,
          category:  osmTagsToCategory(e.tags),
          tags:      e.tags,
        }));
    } catch {
      // essai du miroir suivant
    }
  }
  throw new Error('Tous les serveurs Overpass sont indisponibles');
}

// ── Gestionnaire d'événements map (inside MapContainer) ───────────────────────
function MapEventsHandler({ onBoundsChange, onFetchNeeded, debounceRef }) {
  const map = useMap();

  // Refs pour éviter stale closures dans les handlers leaflet
  const cbRef    = useRef(onBoundsChange);
  const fetchRef = useRef(onFetchNeeded);
  cbRef.current    = onBoundsChange;
  fetchRef.current = onFetchNeeded;

  useEffect(() => {
    function handle() {
      const b    = map.getBounds();
      const zoom = map.getZoom();
      const c    = map.getCenter();
      savePos(c.lat, c.lng, zoom);
      cbRef.current({
        zoom,
        bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
      });
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchRef.current(map), 800);
    }

    handle(); // chargement initial
    map.on('moveend', handle);
    map.on('zoomend', handle);
    return () => {
      map.off('moveend', handle);
      map.off('zoomend', handle);
    };
  }, [map, debounceRef]);

  return null;
}

function FlyToUser({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.2 });
  }, [position, map]);
  return null;
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function MapPage() {
  const savedPos = loadSavedPos(); // lire avant le premier render

  const [pois, setPois]               = useState([]);
  const [userPos, setUserPos]         = useState(null);
  const [activeCategories, setActiveCategories] = useState(Object.keys(CATEGORIES));
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [mapView, setMapView]         = useState(null); // { zoom, bounds }

  // Cache en mémoire : survit aux re-renders, pas besoin de re-fetch
  const poisMapRef   = useRef(new Map()); // id → poi (accumulation)
  const fetchedCells = useRef(new Set()); // clés de cellules déjà chargées
  const debounceTimer = useRef(null);

  // Géolocalisation initiale — on garde la position utilisateur pour le marqueur
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  // Chargement uniquement des cellules nouvelles dans la vue
  const loadNewCells = useCallback(async (map) => {
    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) return;

    const b      = map.getBounds();
    const bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    const cells    = cellsInBounds(bounds);
    const newCells = cells.filter(k => !fetchedCells.current.has(k));
    if (newCells.length === 0) return; // tout déjà en cache → instantané

    // Marquer immédiatement pour éviter les doublons en cas de requêtes parallèles
    newCells.forEach(k => fetchedCells.current.add(k));
    setLoading(true);
    try {
      const allB  = newCells.map(cellBoundsFromKey);
      const south = Math.min(...allB.map(b => b.south));
      const west  = Math.min(...allB.map(b => b.west));
      const north = Math.max(...allB.map(b => b.north));
      const east  = Math.max(...allB.map(b => b.east));

      const results = await fetchOverpassBbox(south, west, north, east);
      let changed = false;
      results.forEach(poi => {
        if (!poisMapRef.current.has(poi.id)) {
          poisMapRef.current.set(poi.id, poi);
          changed = true;
        }
      });
      if (changed) setPois([...poisMapRef.current.values()]);
    } catch {
      // En cas d'erreur réseau, retirer du cache pour permettre un retry
      newCells.forEach(k => fetchedCells.current.delete(k));
    } finally {
      setLoading(false);
    }
  }, []);

  // Filtrage visuel : uniquement ce qui est dans les bounds actuels (pas de requête)
  const visible = useMemo(() => {
    if (!mapView || mapView.zoom < MIN_ZOOM) return [];
    const { south, west, north, east } = mapView.bounds;
    return pois.filter(p =>
      activeCategories.includes(p.category) &&
      p.latitude  >= south && p.latitude  <= north &&
      p.longitude >= west  && p.longitude <= east
    );
  }, [pois, activeCategories, mapView]);

  const presentCategories = useMemo(
    () => [...new Set(pois.map(p => p.category))],
    [pois]
  );

  function toggleCategory(key) {
    setActiveCategories(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  }

  function selectPoi(poi) {
    setSelected({ ...poi, _cat: getCategory(poi.category) });
  }

  const tooFarOut = mapView && mapView.zoom < MIN_ZOOM;

  return (
    <div className="mappage">
      {/* Filtres */}
      {presentCategories.length > 1 && (
        <div className="mappage-filters">
          {presentCategories.map(key => {
            const cat    = getCategory(key);
            const active = activeCategories.includes(key);
            return (
              <button
                key={key}
                className={`mappage-filter${active ? ' mappage-filter--active' : ''}`}
                style={{ '--cat-color': cat.color }}
                onClick={() => toggleCategory(key)}
              >
                <span className="mappage-filter-dot" />
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {loading && <div className="mappage-loading">Chargement…</div>}

      <MapContainer
        center={savedPos?.center ?? DEFAULT_CENTER}
        zoom={savedPos?.zoom ?? DEFAULT_ZOOM}
        className="mappage-map"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {userPos && <FlyToUser position={userPos} />}
        <MapEventsHandler
          onBoundsChange={setMapView}
          onFetchNeeded={loadNewCells}
          debounceRef={debounceTimer}
        />

        {/* Position utilisateur */}
        {userPos && (
          <Marker
            position={userPos}
            icon={L.divIcon({
              html: `<div class="mappage-user-dot"></div>`,
              className: '', iconSize: [16, 16], iconAnchor: [8, 8],
            })}
          >
            <Popup>Vous êtes ici</Popup>
          </Marker>
        )}

        {/* POI — seulement ceux dans la vue actuelle */}
        {visible.map(poi => {
          const cat        = getCategory(poi.category);
          const isSelected = selected?.id === poi.id;
          return (
            <Marker
              key={poi.id}
              position={[poi.latitude, poi.longitude]}
              icon={makeIcon(cat.color, isSelected)}
              eventHandlers={{ click: () => selectPoi(poi) }}
            />
          );
        })}
      </MapContainer>

      <div className="mappage-count">
        {tooFarOut
          ? 'Zoomez pour afficher les points d\'intérêt'
          : `${visible.length} point${visible.length !== 1 ? 's' : ''} affiché${visible.length !== 1 ? 's' : ''}`
        }
      </div>

      <MonumentSheet monument={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
