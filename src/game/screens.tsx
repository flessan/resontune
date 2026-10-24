/**
 * Select, prep and result — React is allowed here. Play HUD is canvas-only.
 */
import { Link } from 'react-router-dom';
import { Artwork } from '@/components/Artwork';
import { IconPlay, IconUpload } from '@/components/Icons';
import type { LocalTrack, Track } from '@/lib/types';
import { formatDuration } from '@/lib/format';
import {
  DIFFICULTIES,
  GAME_VERSION,
  MODIFIERS,
  PREVIEW_SONG,
  type DifficultyId,
  type GameResult,
  type ModifierId,
  type PracticeSettings,
  type SongRef,
} from './types';

export function SelectScreen(props: {
  local: LocalTrack[];
  catalog: Track[];
  error: string;
  loading: boolean;
  onPreview: () => void;
  onFile: (file: File) => void;
  onLocal: (track: LocalTrack) => void;
  onCatalog: (track: Track) => void;
}) {
  return (
    <div className="page flow-page">
      <header className="flow-mast">
        <p className="flow-kicker">Flow · v{GAME_VERSION}</p>
        <h1 className="page-title">Choose a song</h1>
        <p className="page-sub">
          Notes move right to left. Time your hits to the music. Files stay on
          this device; catalog tracks stream the same way the player does.
        </p>
      </header>

      {props.error && <p className="flow-error">{props.error}</p>}
      {props.loading && <p className="flow-status">Preparing the chart…</p>}

      <div className="flow-pick-grid">
        <button className="flow-pick flow-pick-preview" onClick={props.onPreview} type="button">
          <span className="flow-pick-art" aria-hidden>♩</span>
          <span>
            <strong>{PREVIEW_SONG.title}</strong>
            <em>{PREVIEW_SONG.artist}</em>
          </span>
        </button>

        <label className="flow-pick flow-pick-file">
          <IconUpload width={18} height={18} />
          <span>
            <strong>Open a file</strong>
            <em>MP3, WAV, FLAC, OGG — never uploaded</em>
          </span>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wav,.webm"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {props.local.length > 0 && (
        <section className="flow-list">
          <h2>On this device</h2>
          <ul>
            {props.local.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => props.onLocal(t)}>
                  <span>
                    <strong>{t.title}</strong>
                    <em>{t.artist}</em>
                  </span>
                  <span className="flow-list-dur">{t.duration ? formatDuration(t.duration) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.catalog.length > 0 && (
        <section className="flow-list">
          <h2>From the catalog</h2>
          <ul>
            {props.catalog.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => props.onCatalog(t)}>
                  <Artwork src={t.artworkUrl} alt="" className="flow-list-art" />
                  <span>
                    <strong>{t.title}</strong>
                    <em>{t.artist.name}</em>
                  </span>
                  <span className="flow-list-dur">{formatDuration(t.duration)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="flow-foot-note">
        Add files in <Link to="/library">Library</Link> to see them here. Play
        a catalog track from its page with <em>Play in Flow</em>.
      </p>
    </div>
  );
}

export function PrepScreen(props: {
  song: SongRef;
  chartInfo: string;
  beatInfo: string;
  difficulty: DifficultyId;
  modifiers: Set<ModifierId>;
  offset: number;
  musicVolume: number;
  sfxVolume: number;
  practice: PracticeSettings;
  best: number;
  bestGrade: string;
  duration: number;
  onDifficulty: (id: DifficultyId) => void;
  onToggleMod: (id: ModifierId) => void;
  onOffset: (ms: number) => void;
  onMusic: (volume: number) => void;
  onSfx: (volume: number) => void;
  onPractice: (next: PracticeSettings) => void;
  onPlay: () => void;
  onPreviewAudio: () => void;
  onBack: () => void;
}) {
  const { song, practice } = props;
  return (
    <div className="page flow-page flow-prep">
      <button type="button" className="flow-text-btn" onClick={props.onBack}>← Songs</button>
      <div className="flow-prep-hero">
        <div className="flow-prep-art">
          {song.artworkUrl ? (
            <Artwork src={song.artworkUrl} alt={`Artwork for ${song.title}`} />
          ) : (
            <div className="flow-prep-glyph" aria-hidden>♩</div>
          )}
        </div>
        <div>
          <p className="flow-kicker">{song.kind === 'preview' ? 'Metronome' : song.kind === 'catalog' ? 'Catalog' : 'On this device'}</p>
          <h1 className="page-title">{song.title}</h1>
          <p className="page-sub">{song.artist}</p>
          <p className="flow-chart-line">{props.chartInfo}</p>
          <p className="flow-chart-line">{props.beatInfo}</p>
          {props.best > 0 && (
            <p className="flow-best-line">Personal best {props.best.toLocaleString()} · {props.bestGrade}</p>
          )}
        </div>
      </div>

      <div className="flow-row" role="radiogroup" aria-label="Difficulty">
        {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={props.difficulty === id}
            className={`pill ${props.difficulty === id ? 'active' : ''}`}
            onClick={() => props.onDifficulty(id)}
          >
            {DIFFICULTIES[id].label}
          </button>
        ))}
      </div>

      <details className="flow-mods">
        <summary>Modifiers</summary>
        <div className="flow-row">
          {MODIFIERS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pill ${props.modifiers.has(m.id) ? 'active' : ''}`}
              onClick={() => props.onToggleMod(m.id)}
              title={m.hint}
              aria-pressed={props.modifiers.has(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </details>

      <label className="flow-slider">
        Offset
        <input
          type="range"
          min={-200}
          max={200}
          step={5}
          value={props.offset}
          onChange={(e) => props.onOffset(Number(e.target.value))}
        />
        <span className="val">{props.offset > 0 ? '+' : ''}{props.offset}ms</span>
      </label>

      <label className="flow-slider">
        Music
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(props.musicVolume * 100)}
          onChange={(e) => props.onMusic(Number(e.target.value) / 100)}
        />
        <span className="val">{Math.round(props.musicVolume * 100)}</span>
      </label>
      <label className="flow-slider">
        Hits
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(props.sfxVolume * 100)}
          onChange={(e) => props.onSfx(Number(e.target.value) / 100)}
        />
        <span className="val">{Math.round(props.sfxVolume * 100)}</span>
      </label>

      <details className="flow-mods" open={practice.enabled}>
        <summary>Practice</summary>
        <label className="flow-check">
          <input
            type="checkbox"
            checked={practice.enabled}
            onChange={(e) => props.onPractice({ ...practice, enabled: e.target.checked })}
          />
          Practice mode — scores are not saved
        </label>
        {practice.enabled && (
          <div className="flow-practice">
            <label className="flow-slider">
              Start
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.floor(props.duration))}
                step={1}
                value={practice.startAt}
                onChange={(e) => props.onPractice({ ...practice, startAt: Number(e.target.value) })}
              />
              <span className="val">{practice.startAt}s</span>
            </label>
            <label className="flow-slider">
              Speed
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={Math.round(practice.speed * 100)}
                onChange={(e) => props.onPractice({ ...practice, speed: Number(e.target.value) / 100 })}
              />
              <span className="val">{practice.speed.toFixed(2)}×</span>
            </label>
            <label className="flow-check">
              <input
                type="checkbox"
                checked={practice.loop}
                onChange={(e) => props.onPractice({ ...practice, loop: e.target.checked, loopStart: practice.startAt, loopEnd: Math.min(props.duration, practice.startAt + 16) })}
              />
              Loop a 16-second window from the start time
            </label>
          </div>
        )}
      </details>

      <div className="flow-prep-actions">
        <button type="button" className="btn primary" onClick={props.onPlay}>
          <IconPlay width={15} height={15} /> Play
        </button>
        {song.kind !== 'preview' && (
          <button type="button" className="btn" onClick={props.onPreviewAudio}>Preview</button>
        )}
      </div>
      <p className="flow-hint">Any key or tap is a hit. Esc pauses. Holds: keep the input down until the tail.</p>
    </div>
  );
}

export function ResultScreen(props: {
  result: GameResult;
  onRetry: () => void;
  onPrep: () => void;
  onSelect: () => void;
}) {
  const r = props.result;
  const trackHref = r.song.trackSlug ? `/track/${r.song.trackSlug}` : null;
  return (
    <div className="page flow-page flow-result">
      <p className="flow-kicker">{r.practice ? 'Practice' : r.failed ? 'Dropped' : 'Cleared'}</p>
      <h1 className="flow-grade" style={{ color: r.grade.color }}>{r.grade.text}</h1>
      <p className="flow-result-song">{r.song.title} · {DIFFICULTIES[r.difficulty].label}</p>
      {r.isRecord && <p className="flow-record">New personal best</p>}

      <dl className="flow-stats">
        <div><dt>Score</dt><dd>{r.score.toLocaleString()}</dd></div>
        <div><dt>Accuracy</dt><dd>{r.accuracy.toFixed(2)}%</dd></div>
        <div><dt>Max combo</dt><dd>{r.maxCombo}</dd></div>
        <div><dt>Perfect chain</dt><dd>{r.perfectChainMax}</dd></div>
        <div><dt>Fever</dt><dd>{r.feverPeak === 'flow' ? 'FLOW STATE' : r.feverPeak === 'fever' ? 'Fever' : '—'}</dd></div>
        <div><dt>Best</dt><dd>{r.best ? r.best.toLocaleString() : '—'}</dd></div>
      </dl>

      <dl className="flow-counts">
        <div><dt>Perfect</dt><dd>{r.counts.perfect}</dd></div>
        <div><dt>Great</dt><dd>{r.counts.great}</dd></div>
        <div><dt>Good</dt><dd>{r.counts.good}</dd></div>
        <div><dt>Miss</dt><dd>{r.counts.miss}</dd></div>
        <div><dt>Drop</dt><dd>{r.counts.drop}</dd></div>
      </dl>

      <div className="flow-result-actions">
        <button type="button" className="btn primary" onClick={props.onRetry}>Retry</button>
        <button type="button" className="btn" onClick={props.onPrep}>Play again</button>
        <button type="button" className="btn" onClick={props.onSelect}>Return to Flow</button>
        {trackHref && <Link className="btn" to={trackHref}>Return to Track</Link>}
      </div>
    </div>
  );
}
