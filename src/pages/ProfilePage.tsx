/**
 * Public profile - /u/:username.
 *
 * A listener's page on a music platform: who they are, what they've made
 * public, and where to find them elsewhere. Private signals (history,
 * favorites, account identifiers) never appear here; when you're looking at
 * your own page you additionally get owner actions and your listening stats.
 */
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/format';
import { hostOf } from '@/lib/validation';
import { toast } from '@/stores/toast';
import { IconExternal, IconSettings } from '@/components/Icons';
import type { Profile } from '@/lib/types';
import { ContextMenuButton } from '@/contextmenu/ContextMenuButton';
import { useContextTarget } from '@/contextmenu/useContextTarget';
import type { ContextTarget } from '@/contextmenu/types';

interface ProfilePayload {
  profile: Profile;
  stats: { publicPlaylists: number; favorites: number };
  playlists: { id: string; slug: string; title: string; description: string | null; trackCount: number; likeCount: number }[];
  artists: { id: string; slug: string; name: string; imageUrl: string | null; trackCount: number }[];
}

interface OwnStats {
  stats: { tracksPlayed: number; artistsDiscovered: number; favorites: number; memberSince: string };
  topGenres: { id: string; name: string; plays: number }[];
  playlists: { id: string; slug: string; title: string; isPublic: boolean; likeCount: number; trackCount: number }[];
}

type ProfilePlaylist = ProfilePayload['playlists'][number];
type ProfileArtist = ProfilePayload['artists'][number];

function PlaylistCard({ pl, ownerId }: { pl: ProfilePlaylist; ownerId: string | null }) {
  const target: ContextTarget = {
    type: 'playlist',
    playlist: { id: pl.id, slug: pl.slug, title: pl.title, isPublic: true, trackCount: pl.trackCount, ownerId },
  };
  const ctxProps = useContextTarget(target);
  return (
    <Link to={`/playlist/${pl.slug}`} className="profile-playlist" {...ctxProps}>
      <strong>{pl.title}</strong>
      <span>{pl.trackCount} track{pl.trackCount === 1 ? '' : 's'}</span>
      {pl.description && <em>{pl.description}</em>}
      <ContextMenuButton target={target} className="card-more" size={16} />
    </Link>
  );
}

function ArtistCard({ artist }: { artist: ProfileArtist }) {
  const target: ContextTarget = { type: 'artist', artist: { id: artist.id, slug: artist.slug, name: artist.name } };
  const ctxProps = useContextTarget(target);
  return (
    <Link to={`/artist/${artist.slug}`} className="profile-artist-card" {...ctxProps}>
      <Avatar src={artist.imageUrl} name={artist.name} size={44} />
      <span>
        <strong>{artist.name}</strong>
        <em>{artist.trackCount} track{artist.trackCount === 1 ? '' : 's'}</em>
      </span>
      <ContextMenuButton target={target} className="card-more" size={16} />
    </Link>
  );
}

const ROLE_LABEL: Record<string, string> = {
  listener: 'Listener',
  moderator: 'Moderator',
  admin: 'Catalog admin',
};

export default function ProfilePage() {
  const { username } = useParams();
  const me = useAuth((s) => s.user);
  const { data, loading, error } = useFetch<ProfilePayload>(`/users/${username}`, [username]);
  const isOwner = Boolean(me && data && me.id === data.profile.id);
  const { data: own } = useFetch<OwnStats>(isOwner ? '/me/profile' : null, [isOwner, me?.id]);

  const exportData = async () => {
    try {
      const res = await fetch('/api/me/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'resontune-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast('Export failed.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Profile not found</h3>
          <p>No ResonTune account uses that username.</p>
          <Link className="btn small" to="/">Back to Home</Link>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const links = Array.isArray(p.links) ? p.links : [];
  const playlists = Array.isArray(data.playlists) ? data.playlists : [];
  const artists = Array.isArray(data.artists) ? data.artists : [];
  const ownPlaylists = Array.isArray(own?.playlists) ? own.playlists : [];
  const topGenres = Array.isArray(own?.topGenres) ? own.topGenres : [];

  return (
    <div className="page">
      <header className="profile-head">
        <Avatar src={p.avatarUrl} name={p.displayName} size={112} className="profile-avatar" />
        <div className="profile-identity">
          <div className="profile-role-row">
            {p.role !== 'listener' && <span className="role-chip">{ROLE_LABEL[p.role]}</span>}
            <span className="profile-joined">Joined {formatDate(p.joinedAt)}</span>
          </div>
          <h1 className="profile-name">{p.displayName}</h1>
          <div className="profile-username">@{p.username}{p.location ? ` · ${p.location}` : ''}</div>
          {p.bio && <p className="profile-bio">{p.bio}</p>}

          {(p.websiteUrl || links.length > 0) && (
            <div className="profile-links">
              {p.websiteUrl && (
                <a className="profile-link" href={p.websiteUrl} target="_blank" rel="noreferrer noopener nofollow">
                  {hostOf(p.websiteUrl) || 'Website'} <IconExternal width={12} height={12} />
                </a>
              )}
              {links.map((l) => (
                <a key={l.url} className="profile-link" href={l.url} target="_blank" rel="noreferrer noopener nofollow">
                  {l.label} <IconExternal width={12} height={12} />
                </a>
              ))}
            </div>
          )}

          {isOwner && (
            <div className="detail-actions">
              <Link className="btn small primary" to="/profile/edit">
                <IconSettings width={14} height={14} /> Edit profile
              </Link>
              <button className="btn small" onClick={() => void exportData()}>Export my data</button>
              <button className="btn small" onClick={() => void useAuth.getState().logout().then(() => toast('Signed out.'))}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {artists.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Artist pages</h2>
            <span className="section-note">catalog records linked to this account</span>
          </div>
          <div className="profile-artist-row">
            {artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
          </div>
        </>
      )}

      {isOwner && own && (
        <>
          <div className="section-head"><h2 className="section-title">Your listening</h2></div>
          <div className="stat-grid" style={{ marginBottom: 26 }}>
            <div className="stat"><div className="n">{own.stats.tracksPlayed}</div><div className="l">Tracks played</div></div>
            <div className="stat"><div className="n">{own.stats.artistsDiscovered}</div><div className="l">Artists discovered</div></div>
            <div className="stat"><div className="n">{own.stats.favorites}</div><div className="l">Favorites</div></div>
            <div className="stat"><div className="n">{ownPlaylists.length}</div><div className="l">Playlists</div></div>
          </div>
          {topGenres.length > 0 && (
            <div className="pill-row" style={{ marginBottom: 24 }}>
              {topGenres.map((g) => (
                <Link key={g.id} to={`/genre/${g.id}`} className="pill">
                  {g.name} <span style={{ opacity: 0.5, marginLeft: 6 }}>{g.plays}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-head">
        <h2 className="section-title">{isOwner ? 'Your public playlists' : 'Public playlists'}</h2>
        {isOwner && <Link className="section-link" to="/playlists">Manage</Link>}
      </div>
      {playlists.length === 0 ? (
        <div className="empty">
          <h3>Nothing public yet</h3>
          <p>{isOwner ? 'Playlists you mark public will appear on your profile.' : `${p.displayName} hasn't published a playlist yet.`}</p>
        </div>
      ) : (
        <div className="profile-playlists">
          {playlists.map((pl) => <PlaylistCard key={pl.id} pl={pl} ownerId={data.profile.id} />)}
        </div>
      )}
    </div>
  );
}
