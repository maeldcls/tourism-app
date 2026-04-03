import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../css/MonumentSheet.css';

export default function MonumentSheet({ monument, onClose }) {
  const { user, token } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!monument) return null;

  const cat = monument._cat;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      // 1. Créer le monument en DB s'il n'existe pas encore (via POST /monuments)
      const { data: created } = await axios.post(
        'http://localhost:8000/monuments',
        {
          name: monument.name,
          city: monument.tags?.['addr:city'] || monument.tags?.['addr:town'] || null,
          description: monument.tags?.description || null,
          category: monument.category,
          latitude: monument.latitude,
          longitude: monument.longitude,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // 2. Enregistrer la visite
      await axios.post(
        'http://localhost:8000/visits',
        {
          user_id: user.id,
          monument_id: created.id,
          gpt_lat: monument.latitude,
          gps_lon: monument.longitude,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSaved(true);
    } catch {
      // silencieux
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        <div className="sheet-header">
          <span className="sheet-tag" style={{ background: cat.color }}>
            {cat.label}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <h2 className="sheet-title">{monument.name}</h2>

        {monument.tags?.['addr:city'] && (
          <div className="sheet-location">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {monument.tags['addr:city']}
          </div>
        )}

        {monument.tags?.description && (
          <p className="sheet-description">{monument.tags.description}</p>
        )}

        {monument.tags?.website && (
          <a className="sheet-website" href={monument.tags.website} target="_blank" rel="noreferrer">
            Voir le site
          </a>
        )}

        <div className="sheet-coords">
          {monument.latitude?.toFixed(5)}, {monument.longitude?.toFixed(5)}
        </div>

        {user && (
          <button
            className={`sheet-save${saved ? ' sheet-save--done' : ''}`}
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saved ? (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Ajouté à ma liste
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                {saving ? 'Enregistrement…' : 'Ajouter à ma liste'}
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}
