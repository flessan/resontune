/**
 * Small building blocks shared by the catalog manager.
 *
 * The catalog manager is denser than the listener UI but uses the same
 * design language: tonal surfaces, one typeface, restrained motion.
 */
import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconExternal, IconPause, IconPlay, IconTrash } from '@/components/Icons';
import { hostOf, looksLikeAudioUrl, urlError } from '@/lib/validation';
import { STATUS_LABEL, type CatalogStatus } from './types';

export function StatusChip({ status }: { status: CatalogStatus }) {
  return <span className={`status-chip status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function AdminSearch({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="admin-search"
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}

export function StatusFilter({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg-row">
      <button className={`pill ${value === '' ? 'active' : ''}`} onClick={() => onChange('')}>All</button>
      {(Object.keys(STATUS_LABEL) as CatalogStatus[]).map((s) => (
        <button key={s} className={`pill ${value === s ? 'active' : ''}`} onClick={() => onChange(s)}>
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** A text field with inline validation feedback. */
export function Field({
  label, hint, error, children, optional,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label} {optional && <span className="optional">optional</span>}
      </label>
      {children}
      {error ? <div className="hint hint-error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/**
 * A media URL entered by an administrator. ResonTune never fetches these
 * server-side: validation is a deterministic format check, and previewing is
 * something the admin's own browser does, on demand.
 */
export function MediaUrlField({
  label, value, onChange, kind, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind: 'audio' | 'image';
  hint?: string;
}) {
  const [preview, setPreview] = useState(false);
  const error = urlError(value, { requirePath: true });
  const host = hostOf(value);
  const audioWarning =
    kind === 'audio' && value && !error && !looksLikeAudioUrl(value)
      ? 'No recognised audio extension — make sure this is a direct file URL, not a player page.'
      : null;

  useEffect(() => { setPreview(false); }, [value]);

  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="url"
        value={value}
        maxLength={500}
        placeholder={kind === 'audio' ? 'https://cdn.example.com/music/track.mp3' : 'https://cdn.example.com/artwork/cover.jpg'}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="media-url-foot">
        {error ? (
          <span className="hint hint-error">{error}</span>
        ) : value ? (
          <span className="hint">
            <IconCheck width={12} height={12} /> Externally hosted on <strong>{host}</strong>
            {audioWarning ? ` — ${audioWarning}` : ''}
          </span>
        ) : (
          <span className="hint">{hint ?? 'Paste a direct https:// URL you have verified.'}</span>
        )}
        {value && !error && (
          <span className="media-url-actions">
            <button className="link-btn" onClick={() => setPreview((p) => !p)}>
              {preview ? 'Hide preview' : 'Preview'}
            </button>
            <a className="link-btn" href={value} target="_blank" rel="noreferrer noopener nofollow">
              Open <IconExternal width={11} height={11} />
            </a>
          </span>
        )}
      </div>
      {preview && !error && value && (
        kind === 'image'
          ? <ArtworkPreview url={value} />
          : <AudioPreview url={value} />
      )}
    </div>
  );
}

export function ArtworkPreview({ url, size = 96 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  if (failed) {
    return <div className="media-preview media-preview-failed">That image didn't load in your browser.</div>;
  }
  return (
    <img
      className="media-preview media-preview-art"
      style={{ width: size, height: size }}
      src={url}
      alt="Artwork preview"
      onError={() => setFailed(true)}
    />
  );
}

/** Plays the pasted URL directly in the admin's browser — no server proxy. */
export function AudioPreview({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setFailed(false);
  }, [url]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    else { el.pause(); setPlaying(false); }
  };

  return (
    <div className="media-preview media-preview-audio">
      <button className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
      </button>
      <span className="hint">
        {failed ? 'Your browser could not play that URL.' : 'Preview plays in your browser only.'}
      </span>
      <audio
        ref={ref}
        src={url}
        preload="none"
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** Two-step destructive action — no modal, no accidental deletions. */
export function ConfirmButton({
  label, confirmLabel, onConfirm, disabled,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      className={`btn small ${armed ? 'danger' : ''}`}
      disabled={disabled}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      <IconTrash width={14} height={14} /> {armed ? confirmLabel ?? 'Confirm delete' : label}
    </button>
  );
}

/** Editable list of external links, shared by all three editors. */
export function LinksEditor({
  links, onChange,
}: {
  links: { provider: string; label: string; url: string }[];
  onChange: (links: { provider: string; label: string; url: string }[]) => void;
}) {
  return (
    <>
      {links.map((link, i) => {
        const problem = urlError(link.url);
        return (
          <div key={i} className="link-row">
            <input
              type="text" maxLength={40} value={link.label} placeholder="Label (Bandcamp…)"
              onChange={(e) => onChange(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
            />
            <input
              type="url" maxLength={500} value={link.url} placeholder="https://…"
              onChange={(e) => onChange(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
            />
            <button className="icon-btn" aria-label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))}>
              <IconTrash width={15} height={15} />
            </button>
            {problem && <div className="hint hint-error link-row-error">{problem}</div>}
          </div>
        );
      })}
      {links.length < 8 && (
        <button className="btn small" onClick={() => onChange([...links, { provider: '', label: '', url: '' }])}>
          Add a link
        </button>
      )}
    </>
  );
}

export function AdminEmpty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty admin-empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
