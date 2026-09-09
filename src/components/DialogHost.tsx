/**
 * Renders the dialogs that contextual actions raise.
 *
 * Actions run outside the component tree that triggered them, so they ask
 * `useDialogs` for a prompt, a confirmation or the playlist picker and this
 * host - mounted once in `Layout` - supplies the UI and resolves the answer.
 * Replaces the browser's `prompt()`/`confirm()`, which cannot be styled,
 * cannot be themed and blocks the audio thread.
 *
 * Surfaces stay mounted through their exit motion so a dialog does not
 * vanish between frames.
 */
import { useEffect, useRef, useState } from 'react';
import { useDialogs } from '@/stores/dialogs';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { IconClose } from './Icons';
import { useScrollLock } from '@/lib/scrollLock';
import { usePresence } from '@/lib/motion';

function PromptDialog() {
  const req = useDialogs((s) => s.prompt);
  const resolve = useDialogs((s) => s.resolvePrompt);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const held = useRef(req);
  if (req) held.current = req;
  const { present, exiting } = usePresence(!!req);
  useScrollLock(!!req);

  useEffect(() => {
    if (!req) return;
    setValue(req.value ?? '');
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [req]);

  const shown = req ?? held.current;
  if (!present || !shown) return null;
  const submit = () => resolve(value.trim() ? value.trim() : null);

  return (
    <div className={`dialog-backdrop ${exiting ? 'closing' : ''}`} role="presentation" onClick={(e) => e.target === e.currentTarget && resolve(null)}>
      <div
        className="dialog compact"
        role="dialog"
        aria-modal="true"
        aria-label={shown.title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); resolve(null); }
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h3>{shown.title}</h3>
          <button className="icon-btn" onClick={() => resolve(null)} aria-label="Cancel"><IconClose /></button>
        </div>
        <div className="field">
          <label htmlFor="rt-prompt-input">{shown.label ?? 'Name'}</label>
          <input
            id="rt-prompt-input"
            ref={inputRef}
            type="text"
            className="input"
            value={value}
            placeholder={shown.placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn small" onClick={() => resolve(null)}>Cancel</button>
          <button className="btn primary small" onClick={submit} disabled={!value.trim()}>
            {shown.confirmLabel ?? 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog() {
  const req = useDialogs((s) => s.confirm);
  const resolve = useDialogs((s) => s.resolveConfirm);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const held = useRef(req);
  if (req) held.current = req;
  const { present, exiting } = usePresence(!!req);
  useScrollLock(!!req);

  useEffect(() => {
    if (!req) return;
    const id = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [req]);

  const shown = req ?? held.current;
  if (!present || !shown) return null;

  return (
    <div className={`dialog-backdrop ${exiting ? 'closing' : ''}`} role="presentation" onClick={(e) => e.target === e.currentTarget && resolve(false)}>
      <div
        className="dialog compact"
        role="alertdialog"
        aria-modal="true"
        aria-label={shown.title}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); resolve(false); } }}
      >
        <h3>{shown.title}</h3>
        {shown.body && <p className="dialog-sub">{shown.body}</p>}
        <div className="dialog-actions">
          {/* An informational dialog has nothing to decline. */}
          {!shown.acknowledge && <button className="btn small" onClick={() => resolve(false)}>Cancel</button>}
          <button
            ref={confirmRef}
            className={`btn small ${shown.danger ? 'danger' : 'primary'}`}
            onClick={() => resolve(true)}
          >
            {shown.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogHost() {
  const addTo = useDialogs((s) => s.addToPlaylist);
  const closeAddTo = useDialogs((s) => s.closeAddToPlaylist);
  const held = useRef(addTo);
  if (addTo) held.current = addTo;
  const addUi = usePresence(!!addTo);
  return (
    <>
      {addUi.present && held.current && (
        <AddToPlaylistDialog
          trackIds={held.current.trackIds}
          label={held.current.label}
          onClose={closeAddTo}
          closing={addUi.exiting}
        />
      )}
      <PromptDialog />
      <ConfirmDialog />
    </>
  );
}
