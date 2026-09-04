import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapPage.css';
import MonumentSheet from '../components/MonumentSheet';
import CustomPointSheet from '../components/CustomPointSheet';
import MapSearchBar from '../components/MapSearchBar';
import AddCustomPointSheet from '../components/AddCustomPointSheet';
import PointsManagerSheet from '../components/PointsManagerSheet';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import API_URL from '../config';
import { makePointIcon } from '../utils/pointIcons';
import { getCategory } from '../utils/monumentCategories';

// ── Constantes ────────────────────────────────────────────────────────────────
const MIN_ZOOM  = 13;   // en dessous → pas de chargement des POI
const MIN_ZOOM_MY_POINTS = 9; // en dessous → les points de l'utilisateur restent cachés
const MIN_ZOOM_PUBLIC_POINTS = 13; // dataset global (tous les utilisateurs) → seuil comme les POI
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

function makeIcon(color, selected = false) {
  const size = selected ? 32 : 24;
  const h    = selected ? 48 : 36;
  // Le rond central est un vrai trou (pas juste un cercle transparent, qui ne
  // "découpe" rien en SVG) : path + cercle réunis dans un même <path> avec
  // fill-rule="evenodd", qui soustrait la zone du cercle du remplissage du pin.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${h}">
    <path fill-rule="evenodd" fill="${color}"
      d="M12 0C5.37 0 0 5.37 0 12c0 8.5 12 24 12 24S24 20.5 24 12C24 5.37 18.63 0 12 0z
         M17,12 A5,5 0 1,0 7,12 A5,5 0 1,0 17,12 Z"/>
  </svg>`;
  return L.divIcon({
    html: svg, className: '',
    iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -(h + 2)],
  });
}

// ── Couleur du tracé d'un trajet sélectionné ───────────────────────────────────
const TRIP_PENDING_COLOR = '#1e3a5f';

// ── Position en direct des membres d'un trajet ─────────────────────────────────
const LOCATION_POLL_MS = 8000;
const LOCATION_HEARTBEAT_MS = 20000;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function makeMemberIcon(username, avatarUrl) {
  const initial = escapeHtml((username || '?')[0]?.toUpperCase() || '?');
  const inner = avatarUrl
    ? `<img src="${escapeHtml(`${API}${avatarUrl}`)}" alt="" />`
    : `<span>${initial}</span>`;
  return L.divIcon({
    html: `<div class="mappage-member-marker">${inner}</div>`,
    className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18],
  });
}

function timeAgoLabel(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "à l'instant";
  return `il y a ${Math.round(seconds / 60)} min`;
}

// Monuments et points personnalisés d'un trajet partagent un même espace
// d'`order` (voir PATCH /trips/{id}/reorder côté API) : on les fusionne et on
// trie sur ce champ commun pour retrouver l'ordre réel de la timeline.
function orderedTripStops(trip) {
  const monuments = trip.monuments
    .filter(m => m.latitude != null && m.longitude != null)
    .map(m => ({ ...m, kind: 'monument' }));
  const customPoints = (trip.custom_points || [])
    .filter(p => p.latitude != null && p.longitude != null)
    .map(p => ({ ...p, kind: 'custom' }));
  return [...monuments, ...customPoints].sort((a, b) => a.order - b.order);
}

// ── Couche affichant les marqueurs + le tracé d'un trajet sélectionné ─────────
function TripRouteLayer({ trip, routeCoords, onSelect }) {
  const map = useMap();
  const fittedRef = useRef(null);
  const ordered = trip ? orderedTripStops(trip) : [];

  useEffect(() => {
    if (!trip || fittedRef.current === trip.id) return;
    const pts = orderedTripStops(trip).map(it => [it.latitude, it.longitude]);
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
      {ordered.map((it, i) => {
        const icon = makePointIcon(it.icon, it.color, { visited: it.is_visited, orderNumber: i + 1 });
        if (it.kind === 'monument') {
          return (
            <Marker
              key={`m-${it.monument_id}`}
              position={[it.latitude, it.longitude]}
              icon={icon}
              eventHandlers={{ click: () => onSelect(it) }}
            />
          );
        }
        return (
          <Marker key={`c-${it.custom_point_id}`} position={[it.latitude, it.longitude]} icon={icon}>
            <Popup>{it.name}</Popup>
          </Marker>
        );
      })}
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
  const res = await apiFetch(
    `/monuments/bbox?south=${south}&west=${west}&north=${north}&east=${east}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json(); // [{ id, name, latitude, longitude, category, city, description }]
}

// ── Requête bbox des points personnalisés publics d'AUTRES utilisateurs ────────
async function fetchPublicPointsBbox(south, west, north, east) {
  const res = await apiFetch(
    `/custom-points/public?south=${south}&west=${west}&north=${north}&east=${east}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json(); // [{ id, name, icon, color, latitude, longitude, owner }]
}

// ── Capture des clics carte en mode "ajout de point" ──────────────────────────
function AddPointClickHandler({ active, onPick }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng);
    },
  });
  return null;
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
  const { user, token } = useAuth();
  const presetTripId   = state?.presetTripId ?? null; // trajet préselectionné depuis Travel.js
  const presetTripName = state?.presetTripName ?? null;
  const autoShareLocation = state?.autoShareLocation ?? false; // bouton "Partager ma position" depuis Travel.js
  const presetMonument = state?.monument ?? null; // bouton "Voir sur la carte" depuis Monument.js

  const [pois, setPois]               = useState([]);
  const [userPos, setUserPos]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [selectedCustomPoint, setSelectedCustomPoint] = useState(null); // { id, name, icon, color }
  const [mapView, setMapView]         = useState(null); // { zoom, bounds }
  const [trip, setTrip]               = useState(state?.trip ?? null);
  const [tripRoute, setTripRoute]     = useState([]);
  const [myPoints, setMyPoints]       = useState([]); // monuments-en-trajet + points custom de l'utilisateur
  const [publicPoints, setPublicPoints] = useState([]); // points custom publics d'autres utilisateurs (chargés par bbox)
  const [myTrips, setMyTrips]         = useState([]); // liste légère {id, name} pour le menu de réassignation
  const [addMode, setAddMode]         = useState(() => !!presetTripId); // mode "ajout de point" actif (clic à venir)
  const [pendingPoint, setPendingPoint] = useState(null); // {lat, lng} en attente de validation via le formulaire
  const [showPointsManager, setShowPointsManager] = useState(false); // bottom-sheet de gestion des points
  const [sharingLocation, setSharingLocation] = useState(false); // je partage ma position sur le trajet affiché
  const [memberLocations, setMemberLocations] = useState([]); // positions récentes des membres du trajet (soi-même inclus)
  const [actionError, setActionError] = useState(null);

  // Cache en mémoire : survit aux re-renders, pas besoin de re-fetch
  const poisMapRef   = useRef(new Map()); // id → poi (accumulation)
  const fetchedCells = useRef(new Set()); // clés de cellules déjà chargées
  const publicPointsMapRef   = useRef(new Map()); // id → point public (accumulation)
  const fetchedPublicCells   = useRef(new Set());
  const debounceTimer = useRef(null);
  const mapRef         = useRef(null);

  // Partage de position en direct — refs pour éviter les stale closures dans
  // watchPosition/setInterval/beforeunload (V1 : app ouverte au premier plan
  // uniquement, dernière position connue, pas d'historique de tracé stocké).
  const watchIdRef    = useRef(null);
  const heartbeatRef  = useRef(null);
  const locationPollRef = useRef(null);
  const lastPosRef    = useRef(null);
  const sharingRef    = useRef(false);
  const tripIdRef     = useRef(null);

  useEffect(() => { sharingRef.current = sharingLocation; }, [sharingLocation]);
  useEffect(() => { tripIdRef.current = trip?.id ?? null; }, [trip]);

  // Page plein écran type "app" : la carte occupe exactement la hauteur visible,
  // sans le padding-bottom global réservé pour la navbar flottante (qui flotte
  // de toute façon au-dessus de la carte) — évite un léger scroll de page en trop.
  useEffect(() => {
    document.body.classList.add('mappage-body-lock');
    return () => document.body.classList.remove('mappage-body-lock');
  }, []);

  const pushLocation = useCallback((tripId, lat, lng) => {
    if (!token) return;
    // Best-effort : un ping de position toutes les 8-20s, une erreur ponctuelle
    // (réseau flaky) ne justifie pas d'interrompre l'utilisateur avec un banner —
    // seule une trace console reste utile pour le debug.
    apiFetch(`/trips/${tripId}/location`, {
      method: 'PUT',
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    }).catch(err => console.warn('Échec de mise à jour de la position partagée', err));
  }, [token]);

  const startSharing = useCallback((tripId) => {
    if (!navigator.geolocation || watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        lastPosRef.current = [pos.coords.latitude, pos.coords.longitude];
        pushLocation(tripId, pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );
    // Heartbeat : garde la position "fraîche" côté serveur même si l'utilisateur
    // ne bouge pas (watchPosition ne déclenche pas forcément à intervalle régulier).
    heartbeatRef.current = setInterval(() => {
      if (lastPosRef.current) pushLocation(tripId, lastPosRef.current[0], lastPosRef.current[1]);
    }, LOCATION_HEARTBEAT_MS);
  }, [pushLocation]);

  const stopSharing = useCallback((tripId) => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    lastPosRef.current = null;
    if (tripId && token) {
      apiFetch(`/trips/${tripId}/location`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(err => console.warn('Échec de l\'arrêt du partage de position', err));
    }
  }, [token]);

  function toggleShareLocation() {
    if (!trip) return;
    if (sharingLocation) {
      stopSharing(trip.id);
      setSharingLocation(false);
    } else {
      startSharing(trip.id);
      setSharingLocation(true);
    }
  }

  // Positions des membres du trajet affiché : chargement initial (reprend un
  // partage déjà actif côté serveur après un rechargement de page) + polling.
  // Au démontage / changement de trajet : on arrête proprement mon propre partage.
  useEffect(() => {
    if (!trip || !token || !user) {
      setMemberLocations([]);
      setSharingLocation(false);
      return;
    }
    let cancelled = false;
    let firstLoad = true;

    function refresh() {
      // Polling toutes les 8s : une erreur ponctuelle ne doit pas faire clignoter
      // un banner d'erreur, seule une trace console reste utile pour le debug.
      apiFetch(`/trips/${trip.id}/locations`)
        .then(r => (r.ok ? r.json() : []))
        .then(data => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setMemberLocations(list);
          if (firstLoad) {
            firstLoad = false;
            if (list.some(l => l.user_id === user.id) || autoShareLocation) {
              setSharingLocation(true);
              startSharing(trip.id);
            }
          }
        })
        .catch(err => console.warn('Échec de récupération des positions des membres', err));
    }

    refresh();
    locationPollRef.current = setInterval(refresh, LOCATION_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(locationPollRef.current);
      stopSharing(trip.id);
      setSharingLocation(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, token, user]);

  // Best-effort : arrêter le partage si l'utilisateur ferme complètement l'onglet
  // (la fermeture React normale est déjà couverte par le cleanup de l'effet ci-dessus).
  useEffect(() => {
    function handleUnload() {
      if (sharingRef.current && tripIdRef.current && token) {
        apiFetch(`/trips/${tripIdRef.current}/location`, {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => {}); // page en cours de fermeture : rien d'actionnable à faire d'une erreur ici
      }
    }
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [token]);

  // Géolocalisation initiale — on garde la position utilisateur pour le marqueur
  // (ne recentre pas la carte : on veut conserver la position déjà consultée)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  // Tous les points de l'utilisateur (monuments ajoutés à un trajet + points
  // personnalisés) — jeu de données réduit, pas besoin de grille de tuiles.
  useEffect(() => {
    if (!user || !token) return;
    apiFetch(`/trips/user/${user.id}/points`)
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => setMyPoints(Array.isArray(data) ? data : []))
      .catch(() => setActionError('Impossible de charger vos points personnalisés.'));
  }, [user, token]);

  // Liste légère des trajets de l'utilisateur, pour le menu "déplacer vers…"
  // du panneau de gestion des points.
  useEffect(() => {
    if (!user || !token) return;
    apiFetch(`/trips/user/${user.id}`)
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => setMyTrips(Array.isArray(data) ? data.map(t => ({ id: t.id, name: t.name })) : []))
      .catch(() => setActionError('Impossible de charger la liste de vos trajets.'));
  }, [user, token]);

  // Trajet sélectionné depuis la page Voyages → on récupère le tracé (ORS)
  useEffect(() => {
    if (!trip) { setTripRoute([]); return; }
    apiFetch(`/trips/${trip.id}/route`)
      .then(r => {
        // 503 (service non configuré) / 502 (échec ORS) : pas une erreur inattendue,
        // juste "pas de tracé" — mais on prévient quand même, plutôt que de laisser
        // croire que le trajet n'a simplement pas assez de points pour un itinéraire.
        if (!r.ok) { setActionError("Impossible de calculer l'itinéraire de ce trajet."); return { coordinates: [] }; }
        return r.json();
      })
      .then(data => setTripRoute(data.coordinates || []))
      .catch(() => { setActionError("Impossible de calculer l'itinéraire de ce trajet."); setTripRoute([]); });
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

  // Monument présélectionné depuis Monument.js ("Voir sur la carte") : on centre
  // dessus et on ouvre sa fiche, comme pour une sélection depuis la recherche.
  // Le ref de la carte Leaflet peut ne pas être prêt au tout premier rendu →
  // petite tentative répétée plutôt que de silencieusement ignorer le flyTo.
  useEffect(() => {
    if (presetMonument?.id == null || presetMonument.latitude == null || presetMonument.longitude == null) return;

    if (!poisMapRef.current.has(presetMonument.id)) {
      poisMapRef.current.set(presetMonument.id, presetMonument);
      setPois([...poisMapRef.current.values()]);
    }
    setSelected({ ...presetMonument, _cat: getCategory(presetMonument.category) });

    let attempts = 0;
    let timer = null;
    const tryFly = () => {
      if (mapRef.current) {
        mapRef.current.flyTo([presetMonument.latitude, presetMonument.longitude], 17, { duration: 1.2 });
      } else if (attempts++ < 20) {
        timer = setTimeout(tryFly, 50);
      }
    };
    tryFly();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Points publics d'autres utilisateurs — même principe de cache par cellule que
  // loadNewCells, dataset séparé (jamais mélangé aux POI ni à myPoints). On charge
  // toujours (même si le toggle "masquer" est actif) pour que les données soient
  // déjà là si l'utilisateur le réactive ; seul l'affichage filtre sur ce réglage.
  const loadNewPublicCells = useCallback(async (zoom, bounds) => {
    if (zoom < MIN_ZOOM_PUBLIC_POINTS) return;

    const cells    = cellsInBounds(bounds);
    const newCells = cells.filter(k => !fetchedPublicCells.current.has(k));
    if (newCells.length === 0) return;

    fetchedPublicCells.current = new Set([...fetchedPublicCells.current, ...newCells]);
    try {
      const allB  = newCells.map(cellBoundsFromKey);
      const south = Math.min(...allB.map(b => b.south));
      const west  = Math.min(...allB.map(b => b.west));
      const north = Math.max(...allB.map(b => b.north));
      const east  = Math.max(...allB.map(b => b.east));

      const results = await fetchPublicPointsBbox(south, west, north, east);
      let changed = false;
      results.forEach(p => {
        if (!publicPointsMapRef.current.has(p.id)) {
          publicPointsMapRef.current.set(p.id, p);
          changed = true;
        }
      });
      if (changed) setPublicPoints([...publicPointsMapRef.current.values()]);
    } catch {
      newCells.forEach(k => fetchedPublicCells.current.delete(k));
    }
  }, []);

  const handleFetchNeeded = useCallback((zoom, bounds) => {
    loadNewCells(zoom, bounds);
    loadNewPublicCells(zoom, bounds);
  }, [loadNewCells, loadNewPublicCells]);

  // Points de l'utilisateur — seulement quand aucun trajet n'est mis en avant
  // spécifiquement (TripRouteLayer prend le relais dans ce cas, pour ne pas
  // dupliquer les marqueurs), au-delà du zoom minimum et dans les bounds actuels.
  const visibleMyPoints = useMemo(() => {
    if (trip || !mapView || mapView.zoom < MIN_ZOOM_MY_POINTS) return [];
    const { south, west, north, east } = mapView.bounds;
    return myPoints.filter(p =>
      !p.is_hidden &&
      p.latitude != null && p.longitude != null &&
      p.latitude  >= south && p.latitude  <= north &&
      p.longitude >= west  && p.longitude <= east
    );
  }, [myPoints, mapView, trip]);

  // Points publics d'autres utilisateurs — masqués si un trajet est mis en avant
  // (même raison que visibleMyPoints) ou si l'utilisateur a activé le toggle
  // "masquer les points des autres" (préférence de compte, PointsManagerSheet).
  const visiblePublicPoints = useMemo(() => {
    if (trip || user?.hide_others_public_points) return [];
    if (!mapView || mapView.zoom < MIN_ZOOM_PUBLIC_POINTS) return [];
    const { south, west, north, east } = mapView.bounds;
    return publicPoints.filter(p =>
      p.latitude  >= south && p.latitude  <= north &&
      p.longitude >= west  && p.longitude <= east
    );
  }, [publicPoints, mapView, trip, user]);

  // Monuments déjà représentés par un marqueur "point utilisateur" (icône/couleur
  // personnalisée, éventuellement badge visité/numéro) — on masque le pin POI
  // générique correspondant pour qu'il ne se superpose pas dessus et le cache.
  const coveredMonumentIds = useMemo(() => {
    if (trip) return new Set(trip.monuments.map(m => m.monument_id));
    return new Set(visibleMyPoints.filter(p => p.kind === 'monument').map(p => p.monument_id));
  }, [trip, visibleMyPoints]);

  // Filtrage visuel : uniquement ce qui est dans les bounds actuels (pas de requête)
  const visible = useMemo(() => {
    if (!mapView || mapView.zoom < MIN_ZOOM) return [];
    const { south, west, north, east } = mapView.bounds;
    return pois.filter(p =>
      !coveredMonumentIds.has(p.id) &&
      p.latitude  >= south && p.latitude  <= north &&
      p.longitude >= west  && p.longitude <= east
    );
  }, [pois, mapView, coveredMonumentIds]);

  function selectPoi(poi) {
    setSelectedCustomPoint(null);
    setSelected({ ...poi, _cat: getCategory(poi.category) });
  }

  // Clic sur un marqueur de monument en mode "voir sur la carte" d'un trajet
  // → ouvre la fiche détaillée du monument (au lieu d'une simple bulle avec le nom).
  function selectTripMonument(m) {
    setSelectedCustomPoint(null);
    setSelected({
      id: m.monument_id,
      name: m.name,
      category: m.category,
      latitude: m.latitude,
      longitude: m.longitude,
      _cat: getCategory(m.category),
    });
  }

  function selectCustomPoint(p) {
    setSelected(null);
    setSelectedCustomPoint({ id: p.custom_point_id, name: p.name, icon: p.icon, color: p.color });
  }

  // Point public d'un AUTRE utilisateur (couche publicPoints, pas myPoints) —
  // même sheet en lecture seule, id direct (pas de custom_point_id ici).
  function selectPublicCustomPoint(p) {
    setSelected(null);
    setSelectedCustomPoint({ id: p.id, name: p.name, icon: p.icon, color: p.color });
  }

  function handleCustomPointUpdated(id, patch) {
    setMyPoints(prev => prev.map(p => (p.kind === 'custom' && p.custom_point_id === id) ? { ...p, ...patch } : p));
  }

  function handleCustomPointDeleted(id) {
    setMyPoints(prev => prev.filter(p => !(p.kind === 'custom' && p.custom_point_id === id)));
    setSelectedCustomPoint(null);
  }

  function toggleAddMode() {
    setPendingPoint(null);
    setAddMode(a => !a);
  }

  function handlePointCreated(point) {
    setMyPoints(prev => [...prev, {
      kind: 'custom',
      trip_id: point.trip_id,
      custom_point_id: point.id,
      name: point.name,
      category: null,
      latitude: point.latitude,
      longitude: point.longitude,
      icon: point.icon,
      color: point.color,
      is_visited: point.is_visited,
      is_hidden: point.is_hidden,
      day: point.day,
      order: point.order,
    }]);
    setPendingPoint(null);
  }

  function samePoint(a, b) {
    return a.kind === b.kind && (
      a.kind === 'monument'
        ? a.trip_id === b.trip_id && a.monument_id === b.monument_id
        : a.custom_point_id === b.custom_point_id
    );
  }

  async function handleToggleHidden(point) {
    const nextHidden = !point.is_hidden;
    setMyPoints(prev => prev.map(p => samePoint(p, point) ? { ...p, is_hidden: nextHidden } : p));
    try {
      const url = point.kind === 'monument'
        ? `/trips/${point.trip_id}/monuments/${point.monument_id}`
        : `/custom-points/${point.custom_point_id}`;
      const r = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ is_hidden: nextHidden }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError('La visibilité de ce point n\'a pas pu être mise à jour.');
      setMyPoints(prev => prev.map(p => samePoint(p, point) ? { ...p, is_hidden: point.is_hidden } : p));
    }
  }

  async function handleDeleteCustomPoint(point) {
    try {
      const r = await apiFetch(`/custom-points/${point.custom_point_id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setMyPoints(prev => prev.filter(p => !samePoint(p, point)));
    } catch {
      setActionError('Impossible de supprimer ce point — le point reste affiché.');
    }
  }

  // Réassigne un point (monument-en-trajet ou point custom) à un autre trajet,
  // ou le "non attribue" (targetTripId=null, uniquement possible pour un point
  // custom — un monument reste toujours rattaché à un trajet).
  async function handleMovePoint(point, targetTripId) {
    const prevPoints = myPoints;
    const targetTrip = myTrips.find(t => t.id === targetTripId);
    setMyPoints(prev => prev.map(p => samePoint(p, point)
      ? { ...p, trip_id: targetTripId, trip_name: targetTrip?.name ?? null }
      : p));
    try {
      const url = point.kind === 'monument'
        ? `/trips/${point.trip_id}/monuments/${point.monument_id}/move`
        : `/custom-points/${point.custom_point_id}`;
      const body = point.kind === 'monument'
        ? { target_trip_id: targetTripId }
        : targetTripId == null ? { unassign_trip: true } : { trip_id: targetTripId };
      const r = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
    } catch {
      setActionError('Impossible de déplacer ce point vers ce trajet.');
      setMyPoints(prevPoints);
    }
  }

  const tooFarOut = mapView && mapView.zoom < MIN_ZOOM;

  return (
    <div className="mappage">
      <MapSearchBar
        onSelectMonument={handleSelectMonument}
        onSelectPlace={handleSelectPlace}
      />

      {loading && <div className="mappage-loading">Chargement…</div>}

      {actionError && (
        <div className="mappage-trip-banner mappage-trip-banner--error" onClick={() => setActionError(null)}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Fermer">×</button>
        </div>
      )}

      {trip && (
        <div className="mappage-trip-banner">
          <span>Itinéraire : {trip.name}</span>
          <div className="mappage-trip-banner-actions">
            <button
              className={`mappage-share-btn${sharingLocation ? ' mappage-share-btn--active' : ''}`}
              onClick={toggleShareLocation}
              aria-label={sharingLocation ? 'Arrêter de partager ma position' : 'Partager ma position avec le trajet'}
              title={sharingLocation ? 'Arrêter de partager ma position' : 'Partager ma position avec le trajet'}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </button>
            <button onClick={() => setTrip(null)} aria-label="Quitter le mode itinéraire">×</button>
          </div>
        </div>
      )}

      {addMode && !pendingPoint && (
        <div className="mappage-trip-banner mappage-trip-banner--add">
          <span>
            {presetTripName
              ? `Cliquez sur la carte pour ajouter un point à « ${presetTripName} »`
              : 'Cliquez sur la carte pour placer votre point'}
          </span>
          <button onClick={toggleAddMode} aria-label="Annuler l'ajout de point">×</button>
        </div>
      )}

      <MapContainer
        center={savedPos?.center ?? DEFAULT_CENTER}
        zoom={savedPos?.zoom ?? DEFAULT_ZOOM}
        className={`mappage-map${addMode ? ' mappage-map--adding' : ''}`}
        ref={mapRef}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapEventsHandler
          onBoundsChange={setMapView}
          onFetchNeeded={handleFetchNeeded}
          debounceRef={debounceTimer}
        />
        <AddPointClickHandler
          active={addMode}
          onPick={latlng => { setAddMode(false); setPendingPoint(latlng); }}
        />

        {pendingPoint && (
          <Marker position={pendingPoint} icon={makePointIcon('pin', '#c87941')} />
        )}

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

        <TripRouteLayer trip={trip} routeCoords={tripRoute} onSelect={selectTripMonument} />

        {/* Position en direct des autres membres du trajet (soi-même exclu) */}
        {memberLocations.filter(l => l.user_id !== user?.id).map(l => (
          <Marker
            key={`member-${l.user_id}`}
            position={[l.latitude, l.longitude]}
            icon={makeMemberIcon(l.username, l.avatar_url)}
          >
            <Popup>{l.username} · {timeAgoLabel(l.updated_at)}</Popup>
          </Marker>
        ))}

        {/* Points de l'utilisateur (monuments-en-trajet + points personnalisés) */}
        {visibleMyPoints.map(p => {
          const icon = makePointIcon(p.icon, p.color, { visited: p.is_visited });
          const key = `${p.kind}-${p.kind === 'monument' ? p.monument_id : p.custom_point_id}-${p.trip_id ?? 'none'}`;
          if (p.kind === 'monument') {
            return (
              <Marker
                key={key}
                position={[p.latitude, p.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    setSelectedCustomPoint(null);
                    setSelected({
                      id: p.monument_id,
                      name: p.name,
                      category: p.category,
                      latitude: p.latitude,
                      longitude: p.longitude,
                      _cat: getCategory(p.category),
                    });
                  },
                }}
              />
            );
          }
          return (
            <Marker
              key={key}
              position={[p.latitude, p.longitude]}
              icon={icon}
              eventHandlers={{ click: () => selectCustomPoint(p) }}
            />
          );
        })}

        {/* Points personnalisés publics d'autres utilisateurs */}
        {visiblePublicPoints.map(p => (
          <Marker
            key={`public-${p.id}`}
            position={[p.latitude, p.longitude]}
            icon={makePointIcon(p.icon, p.color, { other: true })}
            eventHandlers={{ click: () => selectPublicCustomPoint(p) }}
          />
        ))}

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

      {user && !pendingPoint && (
        <button
          className={`mappage-addpoint-btn${addMode ? ' mappage-addpoint-btn--active' : ''}`}
          onClick={toggleAddMode}
          aria-label={addMode ? "Annuler l'ajout de point" : 'Ajouter un point personnalisé'}
          title={addMode ? "Annuler l'ajout de point" : 'Ajouter un point personnalisé'}
        >
          {addMode ? '×' : '+'}
        </button>
      )}

      {user && (
        <button
          className="mappage-points-btn"
          onClick={() => setShowPointsManager(true)}
          aria-label="Gérer mes points"
          title="Gérer mes points"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
          </svg>
        </button>
      )}

      <div className="mappage-count">
        {tooFarOut
          ? 'Zoomez pour afficher les points d\'intérêt'
          : `${visible.length} point${visible.length !== 1 ? 's' : ''} affiché${visible.length !== 1 ? 's' : ''}`
        }
      </div>

      <MonumentSheet monument={selected} onClose={() => setSelected(null)} />

      <CustomPointSheet
        pointRef={selectedCustomPoint}
        onClose={() => setSelectedCustomPoint(null)}
        onUpdated={handleCustomPointUpdated}
        onDeleted={handleCustomPointDeleted}
      />

      <AddCustomPointSheet
        position={pendingPoint}
        onClose={() => setPendingPoint(null)}
        onCreated={handlePointCreated}
        defaultTripId={presetTripId}
      />

      <PointsManagerSheet
        open={showPointsManager}
        points={myPoints}
        trips={myTrips}
        onClose={() => setShowPointsManager(false)}
        onToggleHidden={handleToggleHidden}
        onMovePoint={handleMovePoint}
        onDeleteCustomPoint={handleDeleteCustomPoint}
      />
    </div>
  );
}
