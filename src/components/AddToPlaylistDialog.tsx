import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Playlist } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { IconClose, IconPlus } from './Icons';
import { useScrollLock } from '@/lib/scrollLock';

/**
 * Add one track — or a whole release — to a playlist. The API takes one
 * track per call, so a multi-track add is a short sequence of them and the
 * dialog reports how many actually landed.
 */
export function AddToPlaylistDialog({
  trackIds,
  label,
  onClose,
}: {
  trackIds: string[];
  /** What the user picked, for the confirmation copy. */
  label?: string;
  onClose: () => void;
}) {
  const user = useAuth((s) => s.user);
  useScrollLock(true);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    api.get<{ playlists: Playlist[] }>('/playlists/mine')
      .then((r) => setPlaylists(r.playlists))
      .catch(() => setPlaylists([]));
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (playlistId: string, title: string) => {
    if (busy) return;
    setBusy(true);
    let added = 0;
    let failure: string | null = null;
    for (const trackId of trackIds) {
      try {
        await api.post(`/playlists/${playlistId}/tracks`, { trackId });
        added += 1;
      } catch (e: any) {
        failure = e?.message ?? 'Failed to add.';
      }
    }
    setBusy(false);
    if (!added) {
      toast(failure ?? 'Failed to add.');
      return;
    }
    toast(added === 1 ? `Added to “${title}”` : `Added ${added} tracks to “${title}”`);
    onClose();
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    try {
      const r = await api.post<{ playlist: Playlist }>('/playlists', { title: newTitle.trim() });
      await add(r.playlist.id, r.playlist.title);
    } catch (e: any) {
      toast(e.message ?? 'Failed to create playlist.');
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Add to playlist" ref={ref}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3>Add to playlist</h3>
            {label && <p className="dialog-sub" style={{ margin: 0 }}>{trackIds.length > 1 ? `${trackIds.length} tracks · ` : ''}{label}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        {!user ? (
          <p className="dialog-sub">Sign in to create playlists that sync across devices.</p>
        ) : playlists === null ? (
          <div className="loading-page"><span className="spin" /></div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {playlists.map((p) => (
                <button key={p.id} className="queue-row" onClick={() => add(p.id, p.title)}>
                  <div className="q-meta">
                    <div className="q-title">{p.title}</div>
                    <div className="q-sub">{p.trackCount} tracks · {p.isPublic ? 'public' : 'private'}</div>
                  </div>
                  <IconPlus width={16} height={16} />
                </button>
              ))}
              {!playlists.length && !creating && (
                <p className="dialog-sub">You don't have any playlists yet.</p>
              )}
            </div>
            {creating ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void create()}
                  placeholder="Playlist name"
                  aria-label="New playlist name"
                  className="input"
                  style={{ flex: 1 }}
                />
                <button className="btn primary small" onClick={() => void create()}>Create</button>
              </div>
            ) : (
              <button className="btn small" onClick={() => setCreating(true)}>
                <IconPlus width={14} height={14} /> New playlist
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
