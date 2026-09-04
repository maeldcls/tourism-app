import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { CATEGORIES } from '../utils/monumentCategories';
import HorizontalRail from '../components/HorizontalRail';
import HomeMonumentTile from '../components/HomeMonumentTile';
import API_URL from '../config';
import '../css/Home.css';

const API = API_URL;

// Catégories mises en avant sur la Home (ordre volontairement différent de
// MapPage : "autre" n'apporte rien à un chip de découverte).
const THEME_KEYS = ['monument', 'musee', 'nature', 'parc', 'eglise', 'restaurant'];

function coverUrl(path) {
  return path?.startsWith('/') ? `${API}${path}` : path;
}

// Choisit le meilleur trajet à proposer pour "Reprendre votre voyage" : priorité
// à un trajet en cours, sinon le premier trajet planifié qui a déjà du contenu
// (un trajet vide ou déjà terminé n'a rien à "reprendre").
function pickResumableTrip(trips) {
  let bestOngoing = null;
  let bestPlanned = null;

  for (const trip of trips) {
    const total = (trip.monuments?.length || 0) + (trip.custom_points?.length || 0);
    if (total === 0) continue;
    const visited = (trip.monuments || []).filter(m => m.is_visited).length
      + (trip.custom_points || []).filter(p => p.is_visited).length;

    if (visited > 0 && visited < total) {
      if (!bestOngoing) bestOngoing = trip;
    } else if (visited === 0 && !bestPlanned) {
      bestPlanned = trip;
    }
  }

  return bestOngoing || bestPlanned || null;
}

function ResumeTripSection({ trip }) {
  const navigate = useNavigate();
  if (!trip) return null;

  const total = (trip.monuments?.length || 0) + (trip.custom_points?.length || 0);
  const visited = (trip.monuments || []).filter(m => m.is_visited).length
    + (trip.custom_points || []).filter(p => p.is_visited).length;

  return (
    <section className="home-resume">
      <button className="home-resume-card" onClick={() => navigate('/travel')}>
        <div className="home-resume-info">
          <span className="home-resume-eyebrow">Reprendre votre voyage</span>
          <span className="home-resume-name">{trip.name}</span>
          <span className="home-resume-progress">{visited} / {total} monuments visités</span>
        </div>
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
        </svg>
      </button>
    </section>
  );
}

function ThemeRail() {
  const navigate = useNavigate();
  return (
    <HorizontalRail title="Explorer par thème">
      {THEME_KEYS.map(key => {
        const cat = CATEGORIES[key];
        return (
          <button
            key={key}
            className="home-theme-chip"
            style={{ '--chip-color': cat.color }}
            onClick={() => navigate(`/destinations?category=${key}`)}
          >
            <span className="home-theme-icon">{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        );
      })}
    </HorizontalRail>
  );
}

function FeaturedDestinationSection({ destination }) {
  return (
    <section className="home-spotlight">
      <div
        className="home-spotlight-banner"
        style={destination.cover_image_url ? { backgroundImage: `url(${coverUrl(destination.cover_image_url)})` } : undefined}
      >
        <div className="home-spotlight-overlay">
          <span className="home-spotlight-name">{destination.name}</span>
          {destination.country && <span className="home-spotlight-country">{destination.country}</span>}
          {destination.tagline && <p className="home-spotlight-tagline">{destination.tagline}</p>}
        </div>
      </div>
      {destination.monuments.length > 0 && (
        <HorizontalRail title="Incontournables">
          {destination.monuments.map(m => <HomeMonumentTile key={m.id} monument={m} />)}
        </HorizontalRail>
      )}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();

  const [resumableTrip, setResumableTrip] = useState(null);
  const [featuredDestinations, setFeaturedDestinations] = useState([]);
  const [recommended, setRecommended] = useState([]);

  const fetchResumableTrip = useCallback(async () => {
    if (!user) { setResumableTrip(null); return; }
    try {
      const r = await apiFetch(`/trips/user/${user.id}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setResumableTrip(pickResumableTrip(Array.isArray(data) ? data : []));
    } catch {
      setResumableTrip(null);
    }
  }, [user]);

  useEffect(() => { fetchResumableTrip(); }, [fetchResumableTrip]);

  useEffect(() => {
    fetch(`${API}/featured-destinations`)
      .then(r => r.json())
      .then(data => setFeaturedDestinations(Array.isArray(data) ? data : []))
      .catch(() => setFeaturedDestinations([]));
  }, []);

  useEffect(() => {
    if (!user) { setRecommended([]); return; }
    // Volontairement sans lat/lon : contrairement à l'onglet "Mes recommandations"
    // de Destinations (toujours ancré géographiquement), ce carrousel propose des
    // goûts de l'utilisateur "où qu'il soit" — complémentaire, pas redondant.
    fetch(`${API}/recommendations?user_id=${user.id}&mode=recommended&limit=10`)
      .then(r => r.json())
      .then(data => setRecommended(Array.isArray(data.items) ? data.items : []))
      .catch(() => setRecommended([]));
  }, [user]);

  return (
    <div className="home-page">
      <header className="home-hero">
        <h1 className="home-hero-title">Où souffle votre prochain voyage ?</h1>
        <p className="home-hero-subtitle">Préparez, vivez et retrouvez vos voyages, un monument à la fois.</p>
      </header>

      <ResumeTripSection trip={resumableTrip} />

      <ThemeRail />

      {featuredDestinations.map(d => (
        <FeaturedDestinationSection key={d.id} destination={d} />
      ))}

      {user && recommended.length > 0 && (
        <HorizontalRail title="Recommandé pour vous" subtitle="Selon vos goûts, où que vous soyez" moreLink="/destinations">
          {recommended.map(m => <HomeMonumentTile key={m.id} monument={m} />)}
        </HorizontalRail>
      )}
    </div>
  );
}
