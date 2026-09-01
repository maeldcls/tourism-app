import API_URL from '../config';

// Avant : chaque page/composant refaisait `fetch(`${API}/...`, { headers: {
// Authorization: `Bearer ${token}` } })` à la main (dupliqué dans une vingtaine
// de fichiers), et un token expiré/invalide (401) échouait silencieusement —
// AuthContext ne le détectait jamais, l'utilisateur restait "connecté" côté
// front avec un token mort.
//
// apiFetch() centralise l'attachement du token et, plus important, notifie un
// handler global dès qu'une réponse 401 arrive — quel que soit l'appelant.
// AuthContext s'enregistre comme ce handler (voir registerUnauthorizedHandler)
// pour déloguer proprement dès qu'un token expiré est détecté, où que ce soit
// dans l'app.

let onUnauthorized = null;

export function registerUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = { ...(options.headers || {}) };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (response.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return response;
}

/** Variante qui parse le JSON et lève une erreur lisible si la réponse n'est pas OK. */
export async function apiFetchJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail || `Erreur ${response.status}`);
  }
  return data;
}
