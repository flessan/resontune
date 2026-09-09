/**
 * The custom theme editor: six named colors, a handful of presets, and a
 * live in-context preview. No graphics-editor machinery - "I like these
 * colors" is the entire mental model. Everything applies instantly through
 * the settings store; nothing here touches playback.
 */
import { useSettings } from '@/stores/settings';
import {
  PALETTE_KEYS,
  PALETTE_LABELS,
  THEME_PRESETS,
  paletteWarnings,
  type PaletteKey,
} from './theme';

const HINTS: Record<PaletteKey, string> = {
  background: 'The room the app lives in',
  surface: 'Cards, menus and the player',
  primary: 'Buttons, highlights and the visualizer',
  secondary: 'A quieter companion color',
  text: 'Titles and body text',
  muted: 'Captions and secondary text',
};

function PreviewCard() {
  const palette = useSettings((s) => s.customPalette);
  return (
    <div className="theme-preview" style={{ background: palette.background }} aria-hidden="true">
      <div className="theme-preview-card" style={{ background: palette.surface }}>
        <div className="theme-preview-art" style={{ background: palette.secondary }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="theme-preview-title" style={{ color: palette.text }}>Night Drive</div>
          <div className="theme-preview-sub" style={{ color: palette.muted }}>Resona · Open Roads</div>
          <div className="theme-preview-track" style={{ background: `${palette.muted}55` }}>
            <div className="theme-preview-fill" style={{ background: palette.primary, width: '62%' }} />
          </div>
        </div>
        <div className="theme-preview-play" style={{ background: palette.primary }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill={palette.surface} aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div className="theme-preview-bars">
        {[0.35, 0.7, 0.5, 0.9, 0.45, 0.75, 0.3, 0.6].map((v, i) => (
          <span
            key={i}
            style={{
              height: `${v * 100}%`,
              background: i % 4 === 0 ? palette.secondary : palette.primary,
              opacity: 0.4 + v * 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ThemeEditor() {
  const theme = useSettings((s) => s.theme);
  const palette = useSettings((s) => s.customPalette);
  const { setTheme, setCustomColor, applyPreset } = useSettings.getState();
  const active = theme === 'custom';
  const warnings = paletteWarnings(palette);

  return (
    <div className={`theme-editor ${active ? '' : 'inactive'}`}>
      <div className="theme-editor-grid">
        <div className="theme-colors" role="group" aria-label="Theme colors">
          {PALETTE_KEYS.map((key) => (
            <label key={key} className="theme-color-row">
              <span className="theme-color-meta">
                <span className="theme-color-name">{PALETTE_LABELS[key]}</span>
                <span className="theme-color-hint">{HINTS[key]}</span>
              </span>
              <span className="theme-swatch" style={{ background: palette[key] }}>
                <input
                  type="color"
                  value={palette[key]}
                  aria-label={`${PALETTE_LABELS[key]} color`}
                  onChange={(e) => {
                    if (!active) setTheme('custom');
                    setCustomColor(key, e.target.value);
                  }}
                />
              </span>
            </label>
          ))}
        </div>
        <div className="theme-editor-side">
          <PreviewCard />
          <p className="theme-presets-label">Or start from a palette</p>
          <div className="pill-row" role="group" aria-label="Theme presets">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="pill theme-preset-pill"
                onClick={() => applyPreset(preset.id)}
              >
                <span className="theme-preset-dots" aria-hidden="true">
                  <i style={{ background: preset.palette.background }} />
                  <i style={{ background: preset.palette.primary }} />
                  <i style={{ background: preset.palette.secondary }} />
                </span>
                {preset.name}
              </button>
            ))}
          </div>
          {warnings.length > 0 && (
            <div className="theme-warnings" role="status">
              {warnings.map((w) => <p key={w}>{w}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
