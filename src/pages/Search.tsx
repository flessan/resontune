import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from '@/components/AppLink';
import { api } from '@/lib/api';
import type { Track, Artist, Album, Playlist, MusicDiscoveryResponse } from '@/lib/types';
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
  const [discovery, setDiscovery] = useState<MusicDiscoveryResponse | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const discoveryRequest = useRef(0);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    discoveryRequest.current += 1;
    setDiscovery(null);
    setDiscoveryError(null);
  }, [q]);

  const searchOtherSources = async (query = q) => {
    const term = query.trim();
    if (term.length < 2) return;
    const requestId = ++discoveryRequest.current;
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const result = await api.get<MusicDiscoveryResponse>(`/discovery/search?q=${encodeURIComponent(term)}`);
      if (requestId === discoveryRequest.current) setDiscovery(result);
    } catch {
      if (requestId === discoveryRequest.current) {
        setDiscoveryError('External discovery is temporarily unavailable. Try again in a moment.');
      }
    } finally {
      if (requestId === discoveryRequest.current) setDiscoveryLoading(false);
    }
  };

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

      {q.length >= 2 && (
        <div className="discovery-action">
          <div>
            <strong>Looking beyond ResonTune?</strong>
            <p>Search public metadata and browse other music services from one place.</p>
          </div>
          <button
            type="button"
            className="discovery-button"
            onClick={() => void searchOtherSources(q)}
            disabled={discoveryLoading}
          >
            {discoveryLoading ? <><span className="spin" /> Searching sources</> : 'Search other sources'}
          </button>
        </div>
      )}

      {discoveryError && <p className="discovery-error" role="status">{discoveryError}</p>}

      {discovery && (
        <section className="discovery-panel" aria-label="External music discovery">
          <div className="section-head">
            <h2 className="section-title">Explore other sources</h2>
            <span className="section-note">External results open on their original service</span>
          </div>
          <div className="provider-search-grid">
            {discovery.sources.map((source) => (
              <a className="provider-search-card" href={source.url} key={source.id} target="_blank" rel="noopener noreferrer">
                <span className="provider-search-title">{source.label}</span>
                <span className="provider-search-description">{source.description}</span>
                <span className="provider-search-open">Open search</span>
              </a>
            ))}
          </div>

          <div className="external-metadata-grid">
            <section className="external-metadata-section">
              <div className="external-section-heading">
                <h3>MusicBrainz recordings</h3>
                <span>{discovery.musicBrainz.status === 'ok' ? discovery.musicBrainz.recordings.length : 'Unavailable'}</span>
              </div>
              {discovery.musicBrainz.status === 'unavailable' ? (
                <p className="discovery-muted">MusicBrainz could not be reached. The external search links above are still available.</p>
              ) : discovery.musicBrainz.recordings.length ? (
                <div className="external-track-list">
                  {discovery.musicBrainz.recordings.map((recording) => (
                    <a className="external-track-row" href={recording.url} key={recording.id} target="_blank" rel="noopener noreferrer">
                      <span className="external-track-artwork" aria-hidden="true">♫</span>
                      <span className="external-track-copy">
                        <strong>{recording.title}</strong>
                        <span>{recording.artist}</span>
                        {recording.release && <small>{recording.release}{recording.releaseDate ? ' · ' + recording.releaseDate : ''}</small>}
                      </span>
                      <span className="external-track-open" aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="discovery-muted">No recording metadata matched this query.</p>
              )}
            </section>

            <section className="external-metadata-section">
              <div className="external-section-heading">
                <h3>Last.fm tracks</h3>
                <span>{discovery.lastFm.status === 'ok' ? discovery.lastFm.tracks.length : discovery.lastFm.status === 'not-configured' ? 'Optional' : 'Unavailable'}</span>
              </div>
              {discovery.lastFm.status === 'not-configured' ? (
                <p className="discovery-muted">Last.fm metadata can be enabled with the server-side LASTFM_API_KEY. The key is never exposed to the browser.</p>
              ) : discovery.lastFm.status === 'unavailable' ? (
                <p className="discovery-muted">Last.fm could not be reached. Use the Last.fm search link above in the meantime.</p>
              ) : discovery.lastFm.tracks.length ? (
                <div className="external-track-list">
                  {discovery.lastFm.tracks.map((track) => (
                    <a className="external-track-row" href={track.url} key={track.id} target="_blank" rel="noopener noreferrer">
                      {track.artworkUrl ? <img className="external-track-artwork" src={track.artworkUrl} alt="" loading="lazy" /> : <span className="external-track-artwork" aria-hidden="true">♫</span>}
                      <span className="external-track-copy">
                        <strong>{track.title}</strong>
                        <span>{track.artist}</span>
                        {track.album && <small>{track.album}</small>}
                      </span>
                      <span className="external-track-open" aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="discovery-muted">No Last.fm tracks matched this query.</p>
              )}
            </section>
          </div>
          <p className="discovery-footnote">These are metadata and source links, not direct audio streams. Playback stays on the provider's official player unless a source explicitly permits direct playback.</p>
        </section>
      )}

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
