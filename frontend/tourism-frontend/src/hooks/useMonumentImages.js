import { useState, useEffect } from 'react';

const DB_API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const THUMB_W = 800;

const cache = new Map();

async function fetchDbImages(monumentId) {
  try {
    const r = await fetch(`${DB_API}/monuments/${monumentId}`);
    if (!r.ok) return [];
    const data = await r.json();
    return data.images || [];
  } catch { return []; }
}

async function fetchCommonsGeosearch(lat, lon) {
  try {
    const params = new URLSearchParams({
      action:      'query',
      list:        'geosearch',
      gsnamespace: 6,
      gslat:       lat.toFixed(5),
      gslon:       lon.toFixed(5),
      gsradius:    200,
      gslimit:     10,
      format:      'json',
      origin:      '*',
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.query?.geosearch || [])
      .filter(h => h.title)
      .map(h => {
        const name = h.title.replace(/^File:/, '').replace(/ /g, '_');
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${THUMB_W}`;
      });
  } catch { return []; }
}

async function fetchWikipediaImage(name) {
  try {
    const params = new URLSearchParams({
      action:       'query',
      generator:    'search',
      gsrsearch:    name,
      gsrnamespace: 0,
      gsrlimit:     1,
      prop:         'pageimages',
      pithumbsize:  THUMB_W,
      pilimit:      1,
      format:       'json',
      origin:       '*',
    });
    const r = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source || null;
  } catch { return null; }
}

async function resolveImages(monument) {
  // Toutes les sources en parallèle
  const [dbImages, geoImages, wikiImage] = await Promise.all([
    fetchDbImages(monument.id),
    monument.latitude && monument.longitude
      ? fetchCommonsGeosearch(monument.latitude, monument.longitude)
      : [],
    monument.name ? fetchWikipediaImage(monument.name) : Promise.resolve(null),
  ]);

  // Combiner et dédupliquer
  const all = [...dbImages, ...geoImages, ...(wikiImage ? [wikiImage] : [])];
  return [...new Set(all)];
}

export function useMonumentImages(monument) {
  const [images, setImages]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!monument?.id) { setImages([]); return; }

    const key = monument.id;
    if (cache.has(key)) { setImages(cache.get(key)); return; }

    let cancelled = false;
    setLoading(true);
    setImages([]);

    resolveImages(monument).then(found => {
      if (cancelled) return;
      cache.set(key, found);
      setImages(found);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [monument?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { images, loading };
}
