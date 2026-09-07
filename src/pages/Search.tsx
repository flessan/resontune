import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Track, Artist, Album, Playlist } from '@/lib/types';
import { TrackRow } from '@/components/TrackRow';
import { ArtistTile, AlbumTile, PlaylistTile } from '@/components/Tiles';
import { listLocalTracks } from '@/local/db';
import type { LocalTrack } from '@/lib/types';
import { LocalTrackRow } from '@/components/LocalTrackRow';
import { IconSearch, IconClose } from '@/components/Icons';

interface Results {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [results, setResults] = useState<Results | null>(null);
  const [localMatches, setLocalMatches] = useState<LocalTrack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (q.length < 2) {
      setResults(null);
      setLocalMatches([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [remote, local] = await Promise.all([
          api.get<Results>(`/search?q=${encodeURIComponent(q)}`),
          listLocalTracks().then((all) =>
            all.filter((t) =>
              `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(q.toLowerCase()),
            ).slice(0, 8),
          ),
        ]);
        if (alive) {
          setResults(remote);
          setLocalMatches(local);
        }
      } catch { /* ignore */ }
      if (alive) setLoading(false);
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };

  const empty = results && !results.tracks.length && !results.artists.length &&
    !results.albums.length && !results.playlists.length && !localMatches.length;

  return (
    <div className="page">
      <form onSubmit={submit} role="search" className="search-form">
        <div className="search-field">
          <IconSearch width={18} height={18} aria-hidden />
          <input
            type="search"
            value={input}
            onChange={(e) => { setInput(e.target.value); setParams(e.target.value.trim() ? { q: e.target.value.trim() } : {}, { replace: true }); }}
            placeholder="Tracks, artists, releases…"
            aria-label="Search query"
            autoFocus
            className="search-hero"
          />
          {input && (
            <button
              type="button"
              className="icon-btn search-clear"
              aria-label="Clear search"
              onClick={() => { setInput(''); setParams({}, { replace: true }); }}
            >
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>
      </form>

      {!q && !loading && (
        <div className="empty">
          <h3>Search ResonTune</h3>
          <p>Find tracks, artists, releases and playlists - or browse by <Link to="/genres" style={{ textDecoration: 'underline' }}>genre</Link>.</p>
        </div>
      )}

      {loading && <div className="loading-page"><span className="spin" /></div>}

      {empty && (
        <div className="empty">
          <h3>Nothing found for “{q}”</h3>
          <p>Try another spelling, or browse by <Link to="/genres" style={{ textDecoration: 'underline' }}>genre</Link>.</p>
        </div>
      )}

      {localMatches.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">From your device</h2>
            <span className="section-note">local files never leave your browser</span>
          </div>
          <div className="tracklist">
            {localMatches.map((t, i) => <LocalTrackRow key={t.id} track={t} index={i} context={localMatches} />)}
          </div>
        </>
      )}

      {results && results.tracks.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Tracks</h2></div>
          <div className="tracklist">
            {results.tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} context={results.tracks} />)}
          </div>
        </>
      )}

      {results && results.artists.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Artists</h2></div>
          <div className="shelf">
            {results.artists.map((a) => <ArtistTile key={a.id} artist={a} />)}
          </div>
        </>
      )}

      {results && results.albums.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Releases</h2></div>
          <div className="shelf">
            {results.albums.map((al) => <AlbumTile key={al.id} album={al} />)}
          </div>
        </>
      )}

      {results && results.playlists.length > 0 && (
        <>
          <div className="section-head"><h2 className="section-title">Playlists</h2></div>
          <div className="shelf">
            {results.playlists.map((p) => <PlaylistTile key={p.id} playlist={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
