import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapPage.css';
import MonumentSheet from '../components/MonumentSheet';

// ── Catégories OSM → label + couleur ─────────────────────────────────────────
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
  if (tourism === 'museum')                    return 'musee';
  if (tourism === 'attraction' || historic)    return 'monument';
  if (amenity === 'place_of_worship')          return 'eglise';
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'bar') return 'restaurant';
  if (leisure === 'park' || leisure === 'garden') return 'parc';
  if (natural)                                 return 'nature';
  if (tourism)                                 return 'monument';
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

// ── Requête Overpass ──────────────────────────────────────────────────────────
async function fetchOverpassPOI(lat, lon, radiusM = 1000) {
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"attraction|museum|artwork|viewpoint"](around:${radiusM},${lat},${lon});
      node["historic"~"monument|memorial|castle|ruins"](around:${radiusM},${lat},${lon});
      node["leisure"~"park|garden"](around:${radiusM},${lat},${lon});
      node["amenity"="place_of_worship"](around:${radiusM},${lat},${lon});
    );
    out body 50;
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });
  const data = await res.json();
  return data.elements
    .filter(e => e.tags?.name)
    .map(e => ({
      id: e.id,
      name: e.tags.name,
      latitude: e.lat,
      longitude: e.lon,
      category: osmTagsToCategory(e.tags),
      tags: e.tags,
    }));
}

// ── Recharge les POI quand la map est déplacée ────────────────────────────────
function MapMoveHandler({ onMoveEnd }) {
  useMapEvents({ moveend: onMoveEnd });
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
  const [pois, setPois]                       = useState([]);
  const [userPos, setUserPos]                 = useState(null);
  const [mapCenter, setMapCenter]             = useState(null);
  const [activeCategories, setActiveCategories] = useState(Object.keys(CATEGORIES));
  const [loading, setLoading]                 = useState(false);
  const [selected, setSelected]               = useState(null);
  const debounceTimer                         = useRef(null);

  // Géolocalisation initiale
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        setMapCenter(coords);
      },
      () => {
        const paris = [48.8566, 2.3522];
        setUserPos(paris);
        setMapCenter(paris);
      }
    );
  }, []);

  // Chargement POI depuis Overpass
  const loadPOI = useCallback(async (lat, lon) => {
    setLoading(true);
    try {
      const results = await fetchOverpassPOI(lat, lon, 2000);
      setPois(results);
    } catch {
      // silencieux — pas d'erreur affichée si Overpass est lent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mapCenter) loadPOI(mapCenter[0], mapCenter[1]);
  }, [mapCenter, loadPOI]);

  function handleMoveEnd(e) {
    const c = e.target.getCenter();
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => loadPOI(c.lat, c.lng), 1000);
  }

  function toggleCategory(key) {
    setActiveCategories(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  }

  function selectPoi(poi) {
    setSelected({ ...poi, _cat: getCategory(poi.category) });
  }

  const visible = pois.filter(p => activeCategories.includes(p.category));
  const presentCategories = [...new Set(pois.map(p => p.category))];

  return (
    <div className="mappage">
      {/* Filtres */}
      {presentCategories.length > 1 && (
        <div className="mappage-filters">
          {presentCategories.map(key => {
            const cat = getCategory(key);
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
        center={userPos || [48.8566, 2.3522]}
        zoom={15}
        className="mappage-map"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {userPos && <FlyToUser position={userPos} />}
        <MapMoveHandler onMoveEnd={handleMoveEnd} />

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

        {/* POI Overpass */}
        {visible.map(poi => {
          const cat = getCategory(poi.category);
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
        {visible.length} point{visible.length !== 1 ? 's' : ''} affiché{visible.length !== 1 ? 's' : ''}
      </div>

      <MonumentSheet monument={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
