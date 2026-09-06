import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import type { Playlist, Track } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { usePlayer } from '@/player/store';
import { useAuth } from '@/stores/auth';
import { trackToQueueItem } from '@/providers';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDuration } from '@/lib/format';
import { canonicalUrl, shareLink } from '@/lib/share';
import { IconPlay, IconHeart, IconTrash, IconDownload, IconEdit, IconCheck } from '@/components/Icons';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import type { ContextTarget } from '@/contextmenu/types';
import { dialogs } from '@/stores/dialogs';

interface Data { playlist: Playlist; tracks: Track[] }

export default function PlaylistPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useFetch<Data>(`/playlists/${slug}`, [slug, refresh]);
  const user = useAuth((s) => s.user);
  const [editing, setEditing] = useState(false);

  /* The header carries the playlist's own contextual menu. */
  const loaded = data?.playlist ?? null;
  const target = useMemo<ContextTarget | null>(
    () => (loaded ? { type: 'playlist', playlist: loaded, onChanged: () => setRefresh((n) => n + 1) } : null),
    [loaded],
  );
  const headProps = useContextTarget(target);

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>This playlist isn't available</h3>
          <p>{error ?? 'It may be private or deleted.'} Head to <Link to="/playlists">your playlists</Link> to make a new one.</p>
        </div>
      </div>
    );
  }

  const { playlist, tracks } = data;
  const isOwner = user && playlist.ownerId === user.id;
  const totalSec = tracks.reduce((s, t) => s + (t.duration ?? 0), 0);

  const playAll = () => {
    const items = tracks.map(trackToQueueItem).filter(Boolean) as NonNullable<ReturnType<typeof trackToQueueItem>>[];
    if (items.length) void usePlayer.getState().playQueue(items, 0);
  };

  const like = async () => {
    if (!user) return toast('Sign in to save playlists.');
    try {
      const r = await api.post<{ liked: boolean }>(`/playlists/${playlist.id}/like`);
      toast(r.liked ? 'Saved to your likes' : 'Removed from likes');
      setRefresh((n) => n + 1);
    } catch (e: any) { toast(e.message); }
  };

  const duplicate = async () => {
    if (!user) return toast('Sign in to duplicate playlists.');
    try {
      const r = await api.post<{ playlist: Playlist }>(`/playlists/${playlist.id}/duplicate`);
      toast('Playlist duplicated');
      navigate(`/playlist/${r.playlist.slug}`);
    } catch (e: any) { toast(e.message); }
  };

  const togglePublic = async () => {
    try {
      await api.patch(`/playlists/${playlist.id}`, { isPublic: !playlist.isPublic });
      toast(playlist.isPublic ? 'Playlist is now private' : 'Playlist is now public');
      setRefresh((n) => n + 1);
    } catch (e: any) { toast(e.message); }
  };

  const rename = async () => {
    const title = await dialogs.prompt({
      title: 'Rename playlist',
      label: 'Playlist name',
      value: playlist.title,
      confirmLabel: 'Rename',
    });
    if (!title || title === playlist.title) return;
    try {
      await api.patch(`/playlists/${playlist.id}`, { title });
      setRefresh((n) => n + 1);
    } catch (e: any) { toast(e.message); }
  };

  const remove = async () => {
    const ok = await dialogs.confirm({
      title: `Delete “${playlist.title}”?`,
      body: 'The playlist is removed for everyone it was shared with. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/playlists/${playlist.id}`);
      toast('Playlist deleted');
      navigate('/playlists');
    } catch (e: any) { toast(e.message); }
  };

  const removeTrack = async (trackId: string) => {
    try {
      await api.del(`/playlists/${playlist.id}/tracks/${trackId}`);
      setRefresh((n) => n + 1);
    } catch (e: any) { toast(e.message); }
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= tracks.length) return;
    const ids = tracks.map((t) => t.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    try {
      await api.put(`/playlists/${playlist.id}/order`, { trackIds: ids });
      setRefresh((n) => n + 1);
    } catch (e: any) { toast(e.message); }
  };

  const share = async () => {
    const result = await shareLink({ title: playlist.title, url: canonicalUrl(`/playlist/${playlist.slug}`) });
    if (result === 'copied') toast('Link copied');
    if (result === 'failed') toast('Could not share that link.');
  };

  const exportM3U = () => {
    const lines = ['#EXTM3U'];
    for (const t of tracks) {
      lines.push(`#EXTINF:${t.duration ?? -1},${t.artist.name} - ${t.title}`);
      // Playback URLs are resolved server-side; export links point at the track page.
      lines.push(new URL(`/track/${t.slug}`, location.origin).toString());
    }
    const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${playlist.slug}.m3u`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <div className="detail-head" {...headProps}>
        <div className="detail-art" style={{ display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          <span style={{ fontSize: 26, fontWeight: 600, color: 'var(--on-surface-faint)', textAlign: 'center', padding: '0 16px', lineHeight: 1.25 }}>
            {playlist.title}
          </span>
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div className="detail-kind">
            {playlist.isCurated ? 'Editorial playlist' : playlist.isPublic ? 'Public playlist' : 'Private playlist'}
          </div>
          <h1 className="detail-title">{playlist.title}</h1>
          <div className="detail-meta">
            {playlist.ownerHandle ? `by ${playlist.ownerHandle} · ` : ''}
            {tracks.length} tracks · {formatDuration(totalSec)} · {playlist.likeCount} likes
          </div>
          {playlist.description && <p className="prose" style={{ marginTop: 10, fontSize: 14 }}>{playlist.description}</p>}
          <div className="detail-actions">
            <button className="btn primary" onClick={playAll}>
              <IconPlay width={15} height={15} /> Play
            </button>
            {playlist.isPublic && (
              <button className="btn" onClick={() => void like()}>
                <IconHeart width={15} height={15} /> Like
              </button>
            )}
            {playlist.isPublic && <button className="btn" onClick={() => void share()}>Share</button>}
            <button className="btn" onClick={() => void duplicate()}>Duplicate</button>
            <button className="btn" onClick={exportM3U} title="Export as M3U">
              <IconDownload width={14} height={14} /> M3U
            </button>
            {isOwner && (
              <>
                <button className="btn" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
                  {editing ? <><IconCheck width={14} height={14} /> Done</> : <><IconEdit width={14} height={14} /> Edit</>}
                </button>
              </>
            )}
            <ContextMenuButton target={target} className="icon-btn" />
          </div>
          {isOwner && editing && (
            <div className="detail-actions" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => void rename()}>Rename</button>
              <button className="btn small" onClick={() => void togglePublic()}>
                Make {playlist.isPublic ? 'private' : 'public'}
              </button>
              <button className="btn small danger" onClick={() => void remove()}>
                <IconTrash width={13} height={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tracklist">
        {tracks.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TrackRow
                track={t}
                index={i}
                context={tracks}
                playlist={{ id: playlist.id, title: playlist.title, owned: Boolean(isOwner) }}
                onChanged={() => setRefresh((n) => n + 1)}
              />
            </div>
            {isOwner && editing && (
              <div style={{ display: 'flex', gap: 2 }}>
                <button className="icon-btn" onClick={() => void move(i, i - 1)} aria-label="Move up" disabled={i === 0}>↑</button>
                <button className="icon-btn" onClick={() => void move(i, i + 1)} aria-label="Move down" disabled={i === tracks.length - 1}>↓</button>
                <button className="icon-btn" onClick={() => void removeTrack(t.id)} aria-label={`Remove ${t.title}`}>
                  <IconTrash width={14} height={14} />
                </button>
              </div>
            )}
          </div>
        ))}
        {!tracks.length && (
          <div className="empty" style={{ marginTop: 16 }}>
            <h3>No tracks yet</h3>
            <p>Add tracks from anywhere in the catalog using the + button.</p>
          </div>
        )}
      </div>
    </div>
  );
}
