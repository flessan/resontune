/**
 * React binding for the lyrics resolver. Follows the given track identity:
 * a track change discards stale state immediately, aborts any in-flight
 * fetch, and resolves fresh (override → cache → LRCLIB). Resolution is
 * asynchronous and never touches playback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasLocalLyrics,
  resetLocalLyrics,
  resolveLyrics,
  saveLocalLyrics,
  type LyricsTrackRef,
  type ResolvedLyrics,
} from './resolver';

export interface LyricsState {
  lyrics: ResolvedLyrics | null;
  loading: boolean;
  /** true when the shown lyrics are the user's own local edit */
  isLocalEdit: boolean;
  save: (edit: { plain: string; syncedRaw: string | null }) => void;
  reset: () => void;
}

export function useLyrics(track: LyricsTrackRef | null): LyricsState {
  const [lyrics, setLyrics] = useState<ResolvedLyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const trackRef = useRef(track);
  trackRef.current = track;

  const identity = track ? `${track.origin}:${track.id}` : null;

  useEffect(() => {
    // Stale lyrics must never appear under a new track: clear first.
    setLyrics(null);
    if (!track) { setLoading(false); return; }
    setLoading(true);
    // Note: the resolver dedupes in-flight fetches across views, so we do
    // NOT abort on unmount (that would kill the shared request another
    // view may be awaiting - and StrictMode double-mounts effects). We
    // simply ignore the result once this subscriber is gone; the response
    // still lands in the bounded cache for the next open.
    let alive = true;
    resolveLyrics(track)
      .then((r) => { if (alive) { setLyrics(r); setLoading(false); } })
      .catch(() => { if (alive) { setLyrics(null); setLoading(false); } });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const save = useCallback((edit: { plain: string; syncedRaw: string | null }) => {
    const t = trackRef.current;
    if (!t) return;
    setLyrics(saveLocalLyrics(t, edit));
  }, []);

  const reset = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    setLoading(true);
    resetLocalLyrics(t)
      .then((r) => { setLyrics(r); setLoading(false); })
      .catch(() => { setLyrics(null); setLoading(false); });
  }, []);

  return {
    lyrics,
    loading,
    isLocalEdit: lyrics?.source === 'local' && !!track && hasLocalLyrics(track),
    save,
    reset,
  };
}
