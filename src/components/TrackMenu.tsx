import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { trackToQueueItem } from '@/providers';
import { toast } from '@/stores/toast';
import { IconDots } from './Icons';

/**
 * Track context menu (⋮) — the streaming-app interaction model:
 * play next / queue / playlist / favorite / go to artist / album /
 * share / details, in one compact surface-anchored menu.
 */
export function TrackMenu({ track, onAddToPlaylist }: { track: Track; onAddToPlaylist: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const isFav = useAuth((s) => s.favoriteIds.has(track.id));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const item = () => trackToQueueItem(track);

  const actions: { label: string; run: () => void }[] = [
    {
      label: 'Play next',
      run: () => {
        const i = item();
        if (!i) return toast('This track has no playable source.');
        usePlayer.getState().playNext(i);
        toast('Playing next');
      },
    },
    {
      label: 'Add to queue',
      run: () => {
        const i = item();
        if (!i) return toast('This track has no playable source.');
        usePlayer.getState().enqueue([i]);
        toast('Added to queue');
      },
    },
    { label: 'Add to playlist', run: onAddToPlaylist },
    {
      label: isFav ? 'Remove from favorites' : 'Add to favorites',
      run: () => {
        if (!user) return toast('Sign in to save favorites.');
        void useAuth.getState().toggleFavorite(track.id).then((fav) => {
          toast(fav ? 'Added to favorites' : 'Removed from favorites');
        });
      },
    },
    { label: 'Go to artist', run: () => navigate(`/artist/${track.artist.slug}`) },
    ...(track.album?.slug ? [{ label: 'Go to album', run: () => navigate(`/release/${track.album!.slug}`) }] : []),
    {
      label: 'Share',
      run: () => {
        const url = `${window.location.origin}/track/${track.slug}`;
        if (navigator.share) {
          void navigator.share({ title: track.title, url }).catch(() => {});
        } else {
          void navigator.clipboard.writeText(url).then(() => toast('Link copied'));
        }
      },
    },
    { label: 'View details', run: () => navigate(`/track/${track.slug}`) },
  ];

  return (
    <div className="track-menu-wrap" ref={wrapRef}>
      <button
        className="icon-btn"
        aria-label={`More options for ${track.title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <IconDots width={16} height={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              className="menu-item"
              onClick={() => { setOpen(false); a.run(); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
