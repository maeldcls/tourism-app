import { ICON_LIBRARY, defaultColorFor } from '../utils/pointIcons';
import '../css/IconColorPicker.css';

export const COLOR_PRESETS = [
  '#e53935', '#8d6e63', '#5e35b1', '#388e3c', '#fbc02d',
  '#7b1fa2', '#f57c00', '#00acc1', '#d81b60', '#607d8b', '#1e3a5f',
];

// ── Sélecteur icône + couleur réutilisable (points custom + override monument) ─
export default function IconColorPicker({ icon, color, onIconChange, onColorChange }) {
  const activeColor = color || defaultColorFor(icon);

  return (
    <div className="icp-root">
      <div className="icp-section-label">Icône</div>
      <div className="icp-icon-grid">
        {Object.entries(ICON_LIBRARY).map(([key, def]) => (
          <button
            key={key}
            type="button"
            className={`icp-icon-btn${icon === key ? ' icp-icon-btn--active' : ''}`}
            style={{ '--icon-color': color || def.color }}
            onClick={() => onIconChange(key)}
            title={def.label}
          >
            <span
              className="icp-icon-glyph"
              dangerouslySetInnerHTML={{
                __html: def.glyph
                  ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">${def.glyph}</svg>`
                  : `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="6" fill="#fff"/></svg>`,
              }}
            />
          </button>
        ))}
      </div>

      <div className="icp-section-label">Couleur</div>
      <div className="icp-color-row">
        {COLOR_PRESETS.map(c => (
          <button
            key={c}
            type="button"
            className={`icp-color-swatch${activeColor === c ? ' icp-color-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onColorChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}
