import { useState, useRef, useCallback, useEffect } from 'react';
import '../css/MapSearchBar.css';
import API_URL from '../config';

const API = API_URL;
const DEBOUNCE_MS = 400;
const MIN_LENGTH  = 2;

async function searchMonuments(query, signal) {
  const res = await fetch(`${API}/monuments?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // [{ id, name, city, category, latitude, longitude, ... }]
}

// Géocodage de lieux (villes, adresses…) via Nominatim/OpenStreetMap — même source que les tuiles
async function searchPlaces(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=0&accept-language=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // [{ place_id, display_name, lat, lon, boundingbox }]
}

export default function MapSearchBar({ onSelectMonument, onSelectPlace }) {
  const [query, setQuery]         = useState('');
  const [monuments, setMonuments] = useState([]);
  const [places, setPlaces]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(false);

  const debounceRef = useRef(null);
  const abortRef     = useRef(null);
  const boxRef        = useRef(null);

  // Fermer le dropdown au clic en dehors
  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = useCallback((q) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    Promise.allSettled([
      searchMonuments(q, controller.signal),
      searchPlaces(q, controller.signal),
    ]).then(([monumentsRes, placesRes]) => {
      if (controller.signal.aborted) return;
      setMonuments(monumentsRes.status === 'fulfilled' ? monumentsRes.value : []);
      setPlaces(placesRes.status === 'fulfilled' ? placesRes.value : []);
      setLoading(false);
      setOpen(true);
    });
  }, []);

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_LENGTH) {
      abortRef.current?.abort();
      setMonuments([]);
      setPlaces([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value.trim()), DEBOUNCE_MS);
  }

  function pickMonument(m) {
    setQuery(m.name);
    setOpen(false);
    onSelectMonument(m);
  }

  function pickPlace(p) {
    setQuery(p.display_name.split(',')[0]);
    setOpen(false);
    onSelectPlace(p);
  }

  function clear() {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setQuery('');
    setMonuments([]);
    setPlaces([]);
    setOpen(false);
  }

  const hasResults = monuments.length > 0 || places.length > 0;

  return (
    <div className="mapsearch" ref={boxRef}>
      <div className="mapsearch-box">
        <svg className="mapsearch-icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => hasResults && setOpen(true)}
          placeholder="Rechercher un lieu ou un monument…"
        />
        {query && (
          <button className="mapsearch-clear" onClick={clear} aria-label="Effacer la recherche">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="mapsearch-results">
          {loading && <div className="mapsearch-status">Recherche…</div>}

          {!loading && !hasResults && (
            <div className="mapsearch-status">Aucun résultat</div>
          )}

          {monuments.length > 0 && (
            <div className="mapsearch-group">
              <div className="mapsearch-group-label">Monuments</div>
              {monuments.map(m => (
                <button key={`m-${m.id}`} className="mapsearch-item" onClick={() => pickMonument(m)}>
                  <span className="mapsearch-item-name">{m.name}</span>
                  {m.city && <span className="mapsearch-item-sub">{m.city}</span>}
                </button>
              ))}
            </div>
          )}

          {places.length > 0 && (
            <div className="mapsearch-group">
              <div className="mapsearch-group-label">Lieux</div>
              {places.map(p => (
                <button key={`p-${p.place_id}`} className="mapsearch-item" onClick={() => pickPlace(p)}>
                  <span className="mapsearch-item-name">{p.display_name.split(',')[0]}</span>
                  <span className="mapsearch-item-sub">
                    {p.display_name.split(',').slice(1, 3).join(',').trim()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
