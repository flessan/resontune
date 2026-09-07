/**
 * A long-form description that stays out of the way on a phone.
 *
 * Desktop has room for the whole text, so it prints in full. On small
 * screens it clamps to a few lines with an explicit control to read the
 * rest - the tracks and releases below stay reachable without a long
 * scroll past prose. Same text, same DOM, only the presentation adapts.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';

export function Blurb({ text, style }: { text: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const long = text.trim().length > 200;

  return (
    <div className={`blurb ${open ? 'open' : ''}`} style={style}>
      <p className="prose">{text}</p>
      {long && (
        <button
          type="button"
          className="link-btn blurb-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
