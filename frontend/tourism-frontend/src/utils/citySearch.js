// Géocodage de villes via Nominatim/OpenStreetMap, partagé entre
// DestinationsSearchBar (page Destinations) et le picker de ville de la page
// admin "Destinations en avant" (page Home).
export const CITY_ADDRESS_TYPES = new Set(['city', 'town', 'village', 'municipality', 'hamlet']);

export async function searchCities(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.filter(p => CITY_ADDRESS_TYPES.has(p.addresstype));
}
