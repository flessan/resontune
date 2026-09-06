import { useState } from 'react';
import { useFetch } from '@/lib/useFetch';
import type { Playlist } from '@/lib/types';
import { PlaylistTile } from '@/components/Tiles';
import { useAuth } from '@/stores/auth';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { IconPlus } from '@/components/Icons';
import { LibraryTabs } from '@/components/LibraryTabs';

export default function Playlists() {
  const user = useAuth((s) => s.user);
  const [refresh, setRefresh] = useState(0);
  const { data: pub, loading } = useFetch<{ playlists: Playlist[] }>('/playlists/public?limit=40', [refresh]);
  const { data: mine } = useFetch<{ playlists: Playlist[] }>(user ? '/playlists/mine' : null, [user?.id, refresh]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const create = async () => {
    if (!title.trim()) return;
    try {
      await api.post('/playlists', { title: title.trim() });
      toast('Playlist created');
      setTitle('');
      setCreating(false);
      setRefresh((n) => n + 1);
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Library</h1>
      <p className="page-sub">Your playlists and playlists shared by the community.</p>
      <LibraryTabs />

      {user && (
        <>
          <div className="section-head">
            <h2 className="section-title">Your playlists</h2>
            {!creating && (
              <button className="btn small" onClick={() => setCreating(true)}>
                <IconPlus width={14} height={14} /> New playlist
              </button>
            )}
          </div>
          {creating && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, maxWidth: 420 }}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
                placeholder="Playlist name"
                aria-label="New playlist name"
                autoFocus
                style={{ flex: 1, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-strong)', background: 'var(--bg-raised)' }}
              />
              <button className="btn primary small" onClick={() => void create()}>Create</button>
              <button className="btn small" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          )}
          {mine?.playlists.length ? (
            <div className="card-row" style={{ marginBottom: 12 }}>
              {mine.playlists.map((p) => <PlaylistTile key={p.id} playlist={p} />)}
            </div>
          ) : (
            <p style={{ color: 'var(--ink-muted)', fontSize: 13.5 }}>No playlists yet — create one, or duplicate a public playlist you like.</p>
          )}
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">Public playlists</h2>
        <span className="section-note">curated & community</span>
      </div>
      {loading ? <div className="loading-page"><span className="spin" /></div> : (
        <div className="card-row">
          {pub?.playlists.map((p) => <PlaylistTile key={p.id} playlist={p} />)}
        </div>
      )}
    </div>
  );
}
