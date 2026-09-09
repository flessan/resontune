/**
 * The lyrics surface shared by the track page, the expanded player and the
 * immersive player. Real DOM text (never canvas), themed through the same
 * tokens as everything else.
 *
 * Synced lyrics follow the authoritative playback clock via engine.onTime;
 * React state changes only when the *active line index* changes (a few
 * times a minute), never per frame. Seeking, pause/resume and track
 * changes all fall out of that: the clock is the player's own.
 *
 * Editing is strictly personal: saves go to localStorage only.
 */
import { useEffect, useRef, useState } from 'react';
import { engine } from '@/player/engine';
import { activeLineIndex } from './lrc';
import type { ResolvedLyrics } from './resolver';

interface LyricsViewProps {
  lyrics: ResolvedLyrics;
  isLocalEdit: boolean;
  /** highlight + auto-follow the active line (only when this track is playing) */
  followPlayback?: boolean;
  /** clicking a synced line seeks there */
  onSeek?: (seconds: number) => void;
  onSave?: (edit: { plain: string; syncedRaw: string | null }) => void;
  onReset?: () => void;
  /** compact header (player panels) vs full section header (track page) */
  compact?: boolean;
}

function SyncedLines({
  lyrics,
  follow,
  onSeek,
}: { lyrics: ResolvedLyrics; follow: boolean; onSeek?: (s: number) => void }) {
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLOListElement>(null);
  const userScrolledAt = useRef(0);

  // Follow the player's own clock; update React only on line *changes*.
  useEffect(() => {
    if (!follow) { setActive(-1); return; }
    let last = -2;
    return engine.onTime((t) => {
      const idx = activeLineIndex(lyrics.lines, t);
      if (idx !== last) {
        last = idx;
        setActive(idx);
      }
    });
  }, [lyrics, follow]);

  // Keep the active line visible - unless the user is reading elsewhere.
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    if (Date.now() - userScrolledAt.current < 4000) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <ol
      ref={listRef}
      className="lyr-synced"
      onWheel={() => { userScrolledAt.current = Date.now(); }}
      onTouchMove={() => { userScrolledAt.current = Date.now(); }}
      aria-label="Lyrics"
    >
      {lyrics.lines.map((line, i) => {
        const isActive = follow && i === active;
        const body = line.text || '\u266A';
        return (
          <li key={`${line.time}-${i}`} className={isActive ? 'active' : ''}>
            {onSeek ? (
              <button
                type="button"
                className="lyr-line"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSeek(line.time)}
              >
                {body}
              </button>
            ) : (
              <span className="lyr-line static" aria-current={isActive ? 'true' : undefined}>{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Editor({
  lyrics,
  onCancel,
  onSave,
}: {
  lyrics: ResolvedLyrics;
  onCancel: () => void;
  onSave: (edit: { plain: string; syncedRaw: string | null }) => void;
}) {
  // Edit the synced (timestamped) text when it exists so timestamps are
  // preserved; otherwise the plain body.
  const editingSynced = lyrics.synced && lyrics.syncedRaw != null;
  const [text, setText] = useState(editingSynced ? lyrics.syncedRaw! : lyrics.plain);

  const save = () => {
    if (editingSynced) {
      onSave({ plain: '', syncedRaw: text });
    } else {
      onSave({ plain: text, syncedRaw: null });
    }
  };

  return (
    <div className="lyr-editor">
      {editingSynced && (
        <p className="lyr-edit-hint">
          Lines keep their <span className="kbd">[mm:ss.xx]</span> timestamps - leave them as they
          are unless you want to retime a line.
        </p>
      )}
      <textarea
        className="input lyr-edit-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(24, Math.max(10, text.split('\n').length + 2))}
        aria-label="Edit lyrics"
        spellCheck={false}
      />
      <div className="lyr-edit-actions">
        <button type="button" className="btn small primary" onClick={save}>Save on this device</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        <span className="lyr-edit-note">Saved only in this browser - never uploaded.</span>
      </div>
    </div>
  );
}

export function LyricsView({
  lyrics,
  isLocalEdit,
  followPlayback = false,
  onSeek,
  onSave,
  onReset,
  compact = false,
}: LyricsViewProps) {
  const [editing, setEditing] = useState(false);

  // A track change swaps the lyrics object; leave edit mode with it.
  useEffect(() => { setEditing(false); }, [lyrics]);

  return (
    <div className={`lyr ${compact ? 'compact' : ''}`}>
      <div className="lyr-head">
        <span className="lyr-kind">{lyrics.synced ? 'Synced lyrics' : 'Lyrics'}</span>
        {isLocalEdit && <span className="lyr-badge">Edited locally</span>}
        <span className="lyr-spacer" />
        {!editing && onSave && (
          <button type="button" className="btn small" onClick={() => setEditing(true)}>
            Edit lyrics
          </button>
        )}
        {!editing && isLocalEdit && onReset && (
          <button type="button" className="btn small" onClick={onReset}>
            Reset to LRCLIB
          </button>
        )}
      </div>

      {editing && onSave ? (
        <Editor
          lyrics={lyrics}
          onCancel={() => setEditing(false)}
          onSave={(edit) => { onSave(edit); setEditing(false); }}
        />
      ) : lyrics.synced ? (
        <SyncedLines lyrics={lyrics} follow={followPlayback} onSeek={onSeek} />
      ) : (
        <div className="lyrics-body">{lyrics.plain}</div>
      )}

      {!editing && lyrics.source === 'lrclib' && (
        <p className="lyr-credit">Lyrics from LRCLIB</p>
      )}
    </div>
  );
}
