import { useState, useRef, useCallback, useEffect } from 'react';
import '../css/DestinationsSearchBar.css';

const DEBOUNCE_MS = 400;
const MIN_LENGTH = 2;

const CITY_ADDRESS_TYPES = new Set(['city', 'town', 'village', 'municipality', 'hamlet']);

// Géocodage de villes via Nominatim/OpenStreetMap — même source que MapSearchBar,
// filtré côté client aux résultats de type "lieu" (ville/village…) pour exclure adresses et POI.
async function searchCities(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.filter(p => CITY_ADDRESS_TYPES.has(p.addresstype));
}

export default function DestinationsSearchBar({ city, onSelectCity, onOpenFilter, filterActive }) {
  const [query, setQuery] = useState(city?.name ?? '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const boxRef = useRef(null);

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

    searchCities(q, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setResults(data);
        setLoading(false);
        setOpen(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResults([]);
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
      setResults([]);
      setLoading(false);
      setOpen(false);
      if (city) onSelectCity(null);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value.trim()), DEBOUNCE_MS);
  }

  function pickCity(p) {
    const name = p.display_name.split(',')[0];
    setQuery(name);
    setOpen(false);
    onSelectCity({ name, lat: parseFloat(p.lat), lon: parseFloat(p.lon) });
  }

  function clear() {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelectCity(null);
  }

  return (
    <div className="dsb" ref={boxRef}>
      <div className="dsb-box">
        <svg className="dsb-icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Rechercher une ville…"
        />
        {query && (
          <button className="dsb-clear" onClick={clear} aria-label="Effacer la recherche">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
        <button
          className={`dsb-filter-btn ${filterActive ? 'dsb-filter-btn--active' : ''}`}
          onClick={onOpenFilter}
          aria-label="Filtres"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M3 5h18v2H3V5zm4 6h10v2H7v-2zm4 6h2v2h-2v-2z" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="dsb-results">
          {loading && <div className="dsb-status">Recherche…</div>}
          {!loading && results.length === 0 && (
            <div className="dsb-status">Aucune ville trouvée</div>
          )}
          {results.map(p => (
            <button key={p.place_id} className="dsb-item" onClick={() => pickCity(p)}>
              <span className="dsb-item-name">{p.display_name.split(',')[0]}</span>
              <span className="dsb-item-sub">
                {p.display_name.split(',').slice(1, 3).join(',').trim()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
