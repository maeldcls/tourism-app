import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/AddToTripDialog.css';
import '../css/AddPhotoDialog.css';

const API = API_URL;
const MAX_PHOTOS = 3;

export default function AddPhotoDialog({ monument, onClose }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function handlePick(e) {
    const picked = Array.from(e.target.files || []).slice(0, MAX_PHOTOS);
    setFiles(picked);
    setPreviews(picked.map(f => URL.createObjectURL(f)));
    setFeedback(null);
    e.target.value = '';
  }

  function removeAt(i) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (files.length === 0) return;
    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      files.forEach(f => form.append('files', f));
      const r = await fetch(`${API}/monuments/${monument.id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur lors de l\'envoi');
      }
      setFeedback({ type: 'success', message: 'Photo(s) envoyée(s) ! En attente de validation par un admin.' });
      setFiles([]);
      setPreviews([]);
      setTimeout(onClose, 1400);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="atd-backdrop" onClick={onClose} />
      <div className="atd-dialog" role="dialog" aria-modal="true">
        <div className="atd-header">
          <div className="atd-header-left">
            <svg className="atd-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 2l-1.83 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
            <h3>Proposer une photo</h3>
          </div>
          <button className="atd-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <p className="atd-monument-name">{monument.name}</p>

        {!user ? (
          <>
            <p className="apd-hint">Connecte-toi pour proposer une photo de ce lieu.</p>
            <button className="atd-create-btn" onClick={() => navigate('/login')}>Se connecter</button>
          </>
        ) : (
          <>
            {feedback && (
              <div className={`atd-feedback atd-feedback--${feedback.type}`}>{feedback.message}</div>
            )}

            <p className="apd-hint">
              Jusqu'à {MAX_PHOTOS} photos. Elles apparaîtront sur la fiche du monument après validation par un admin.
            </p>

            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handlePick} />

            {previews.length === 0 ? (
              <button className="apd-picker" onClick={() => inputRef.current?.click()} disabled={uploading}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Choisir des photos
              </button>
            ) : (
              <>
                <div className="apd-previews">
                  {previews.map((src, i) => (
                    <div className="apd-preview" key={i}>
                      <img src={src} alt="" />
                      <button className="apd-remove" onClick={() => removeAt(i)} disabled={uploading} aria-label="Retirer">✕</button>
                    </div>
                  ))}
                  {previews.length < MAX_PHOTOS && (
                    <button className="apd-add-more" onClick={() => inputRef.current?.click()} disabled={uploading} aria-label="Ajouter une photo">+</button>
                  )}
                </div>
                <button className="atd-create-btn apd-submit" onClick={submit} disabled={uploading}>
                  {uploading ? <div className="atd-btn-spinner atd-btn-spinner--light" /> : `Envoyer ${files.length} photo${files.length > 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
