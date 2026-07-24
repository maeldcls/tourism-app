import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import TagPickerModal from './TagPickerModal';
import '../css/MonumentTags.css';

const API = API_URL;

export default function MonumentTags({ monumentId }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState({ top_tags: [], user_tag_ids: [] });
  const [modalOpen, setModalOpen] = useState(false);

  const fetchTags = useCallback(() => {
    fetch(`${API}/monuments/${monumentId}/tags`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [monumentId, token]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  function openPicker() {
    if (!user) { navigate('/login'); return; }
    setModalOpen(true);
  }

  return (
    <div className="monu-section monu-tags">
      <h2 className="monu-section-title">Tags de la communauté</h2>

      <div className="monu-tags-list">
        {data.top_tags.map(t => (
          <span
            key={t.tag_id}
            className={`monu-tag-chip monu-tag-chip--${t.sentiment}${t.voted ? ' monu-tag-chip--voted' : ''}`}
          >
            {t.emoji} {t.label} <span className="monu-tag-chip-count">{t.count}</span>
          </span>
        ))}

        <button className="monu-tag-add-btn" onClick={openPicker} aria-label="Ajouter un tag">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>

      {data.top_tags.length === 0 && (
        <p className="monu-tags-empty">Aucun tag pour l'instant. Soyez le premier à en ajouter !</p>
      )}

      {modalOpen && (
        <TagPickerModal
          monumentId={monumentId}
          userTagIds={data.user_tag_ids}
          onChanged={fetchTags}
          onClose={() => { setModalOpen(false); fetchTags(); }}
        />
      )}
    </div>
  );
}
