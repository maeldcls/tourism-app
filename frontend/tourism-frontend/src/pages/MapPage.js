import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapPage.css';
import MonumentSheet from '../components/MonumentSheet';
import MapSearchBar from '../components/MapSearchBar';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';

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

const API = API_URL;

// ── Catégories ────────────────────────────────────────────────────────────────
const CATEGORIES = {
  monument:   { color: '#f57c00', label: 'Monument'   },
  musee:      { color: '#7b1fa2', label: 'Musée'      },
  parc:       { color: '#388e3c', label: 'Parc'       },
  eglise:     { color: '#fbc02d', label: 'Église'     },
  nature:     { color: '#00897b', label: 'Nature'     },
  restaurant: { color: '#e53935', label: 'Restaurant' },
  autre:      { color: '#2196f3', label: 'Autre'      },
};

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

// ── Icônes des trajets (distinctes des POI, couleur selon visité/non visité) ──
const TRIP_VISITED_COLOR = '#a8b826';
const TRIP_PENDING_COLOR = '#1e3a5f';

function makeTripIcon(visited) {
  const color = visited ? TRIP_VISITED_COLOR : TRIP_PENDING_COLOR;
  const size = 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="#fff" stroke-width="2.5"/>
    <path d="M8 6.5v11M8 6.5l7.5 3L8 12.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
  return L.divIcon({
    html: svg, className: '',
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ── Couche affichant les marqueurs + le tracé d'un trajet sélectionné ─────────
function TripRouteLayer({ trip, routeCoords }) {
  const map = useMap();
  const fittedRef = useRef(null);

  useEffect(() => {
    if (!trip || fittedRef.current === trip.id) return;
    const pts = trip.monuments
      .filter(m => m.latitude != null && m.longitude != null)
      .map(m => [m.latitude, m.longitude]);
    if (pts.length === 0) return;
    fittedRef.current = trip.id;
    if (pts.length === 1) {
      map.flyTo(pts[0], 16, { duration: 1.2 });
    } else {
      map.flyToBounds(pts, { duration: 1.2, padding: [60, 60] });
    }
  }, [trip, map]);

  if (!trip) return null;

  return (
    <>
      {routeCoords.length > 1 && (
        <Polyline positions={routeCoords} pathOptions={{ color: TRIP_PENDING_COLOR, weight: 4, opacity: 0.85 }} />
      )}
      {trip.monuments.map(m => (
        m.latitude != null && m.longitude != null && (
          <Marker
            key={m.monument_id}
            position={[m.latitude, m.longitude]}
            icon={makeTripIcon(m.is_visited)}
          >
            <Popup>{m.name}{m.is_visited ? ' — visité' : ''}</Popup>
          </Marker>
        )
      ))}
    </>
  );
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

// ── Requête bbox vers notre API ───────────────────────────────────────────────
async function fetchApiBbox(south, west, north, east) {
  const url = `${API}/monuments/bbox?south=${south}&west=${west}&north=${north}&east=${east}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json(); // [{ id, name, latitude, longitude, category, city, description }]
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
    let alive = true;

    function handle() {
      const zoom   = map.getZoom();
      const b      = map.getBounds();
      const bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      const c      = map.getCenter();
      savePos(c.lat, c.lng, zoom);
      cbRef.current({ zoom, bounds });
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (alive) fetchRef.current(zoom, bounds);
      }, 800);
    }

    handle(); // chargement initial
    map.on('moveend', handle);
    map.on('zoomend', handle);
    return () => {
      alive = false;
      map.off('moveend', handle);
      map.off('zoomend', handle);
      clearTimeout(debounceRef.current);
    };
  }, [map, debounceRef]);

  return null;
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function MapPage() {
  const savedPos = loadSavedPos(); // lire avant le premier render
  const { state } = useLocation();
  const { token } = useAuth();

  const [pois, setPois]               = useState([]);
  const [userPos, setUserPos]         = useState(null);
  const [activeCategories, setActiveCategories] = useState(Object.keys(CATEGORIES));
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [mapView, setMapView]         = useState(null); // { zoom, bounds }
  const [trip, setTrip]               = useState(state?.trip ?? null);
  const [tripRoute, setTripRoute]     = useState([]);

  // Cache en mémoire : survit aux re-renders, pas besoin de re-fetch
  const poisMapRef   = useRef(new Map()); // id → poi (accumulation)
  const fetchedCells = useRef(new Set()); // clés de cellules déjà chargées
  const debounceTimer = useRef(null);
  const mapRef         = useRef(null);

  // Géolocalisation initiale — on garde la position utilisateur pour le marqueur
  // (ne recentre pas la carte : on veut conserver la position déjà consultée)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  // Trajet sélectionné depuis la page Voyages → on récupère le tracé (ORS)
  useEffect(() => {
    if (!trip) { setTripRoute([]); return; }
    fetch(`${API}/trips/${trip.id}/route`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { coordinates: [] })
      .then(data => setTripRoute(data.coordinates || []))
      .catch(() => setTripRoute([]));
  }, [trip, token]);

  const recenterOnUser = useCallback(() => {
    if (userPos && mapRef.current) {
      mapRef.current.flyTo(userPos, 15, { duration: 1.2 });
    }
  }, [userPos]);

  // Sélection d'un monument depuis la recherche → recentre et ouvre sa fiche
  const handleSelectMonument = useCallback((poi) => {
    if (!poisMapRef.current.has(poi.id)) {
      poisMapRef.current.set(poi.id, poi);
      setPois([...poisMapRef.current.values()]);
    }
    mapRef.current?.flyTo([poi.latitude, poi.longitude], 17, { duration: 1.2 });
    setSelected({ ...poi, _cat: getCategory(poi.category) });
  }, []);

  // Sélection d'un lieu (ville, adresse…) depuis la recherche → recentre sans ouvrir de fiche
  const handleSelectPlace = useCallback((place) => {
    const map = mapRef.current;
    if (!map) return;
    if (place.boundingbox) {
      const [south, north, west, east] = place.boundingbox.map(Number);
      map.flyToBounds([[south, west], [north, east]], { duration: 1.2, maxZoom: 16 });
    } else {
      map.flyTo([Number(place.lat), Number(place.lon)], 14, { duration: 1.2 });
    }
  }, []);

  // Chargement uniquement des cellules nouvelles dans la vue
  const loadNewCells = useCallback(async (zoom, bounds) => {
    if (zoom < MIN_ZOOM) return;

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

      const results = await fetchApiBbox(south, west, north, east);
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
      <MapSearchBar
        onSelectMonument={handleSelectMonument}
        onSelectPlace={handleSelectPlace}
      />

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

      {trip && (
        <div className="mappage-trip-banner">
          <span>Itinéraire : {trip.name}</span>
          <button onClick={() => setTrip(null)} aria-label="Quitter le mode itinéraire">×</button>
        </div>
      )}

      <MapContainer
        center={savedPos?.center ?? DEFAULT_CENTER}
        zoom={savedPos?.zoom ?? DEFAULT_ZOOM}
        className="mappage-map"
        ref={mapRef}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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

        <TripRouteLayer trip={trip} routeCoords={tripRoute} />

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

      {userPos && (
        <button
          className="mappage-locate-btn"
          onClick={recenterOnUser}
          aria-label="Recentrer sur ma position"
          title="Recentrer sur ma position"
        >
          📍
        </button>
      )}

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
