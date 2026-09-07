/** Catalog overview — what exists, what changed, what needs attention. */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { formatDate } from '@/lib/format';
import { useCatalogRole } from './AdminLayout';
import { StatusChip } from './ui';
import type { CatalogOverview } from './types';

const KIND_PATH = { artist: 'artists', release: 'releases', track: 'tracks' } as const;

export default function Overview() {
  const { canEdit } = useCatalogRole();
  const { data, loading } = useFetch<CatalogOverview>('/admin/overview');

  if (loading) return <div className="loading-page"><span className="spin" /></div>;
  if (!data) return null;

  const { counts, recent, warnings } = data;
  const empty = counts.artists.total === 0 && counts.releases.total === 0 && counts.tracks.total === 0;
  const attention = [
    warnings.tracksMissingAudio && {
      label: `${warnings.tracksMissingAudio} published track(s) have no streamable audio URL`,
      to: '/admin/tracks?missingAudio=1',
    },
    warnings.releasesWithoutTracks && {
      label: `${warnings.releasesWithoutTracks} published release(s) have no tracks`,
      to: '/admin/releases',
    },
    warnings.publishedWithoutLicense && {
      label: `${warnings.publishedWithoutLicense} published track(s) have no license recorded`,
      to: '/admin/tracks',
    },
  ].filter(Boolean) as { label: string; to: string }[];

  return (
    <>
      <div className="admin-stats">
        {([
          ['Artists', counts.artists, '/admin/artists'],
          ['Releases', counts.releases, '/admin/releases'],
          ['Tracks', counts.tracks, '/admin/tracks'],
        ] as const).map(([label, c, to]) => (
          <Link key={label} to={to} className="admin-stat">
            <div className="n">{c.total ?? 0}</div>
            <div className="l">{label}</div>
            <div className="admin-stat-split">
              <span>{c.published ?? 0} published</span>
              <span>{(c.unlisted ?? 0) + (c.taken_down ?? 0) + (c.archived ?? 0)} hidden</span>
            </div>
          </Link>
        ))}
      </div>

      {empty ? (
        <div className="empty admin-empty">
          <h3>The catalog is empty</h3>
          <p>
            Start with an artist, add a release, then add tracks with their
            externally hosted audio URLs. Nothing is seeded — everything here is
            music you publish on purpose.
          </p>
          {canEdit && <Link className="btn small primary" to="/admin/artists/new">Create the first artist</Link>}
        </div>
      ) : (
        <>
          {attention.length > 0 && (
            <>
              <div className="section-head"><h2 className="section-title">Needs attention</h2></div>
              <ul className="admin-attention">
                {attention.map((a) => (
                  <li key={a.label}><Link to={a.to}>{a.label}</Link></li>
                ))}
              </ul>
            </>
          )}

          <div className="section-head">
            <h2 className="section-title">Recently modified</h2>
            {canEdit && (
              <span className="admin-quick">
                <Link className="btn small" to="/admin/artists/new">New artist</Link>
                <Link className="btn small" to="/admin/releases/new">New release</Link>
                <Link className="btn small primary" to="/admin/tracks/new">New track</Link>
              </span>
            )}
          </div>
          <div className="admin-list">
            {recent.map((item) => (
              <Link key={`${item.kind}-${item.id}`} to={`/admin/${KIND_PATH[item.kind]}/${item.id}`} className="admin-row">
                <span className="admin-row-kind">{item.kind}</span>
                <span className="admin-row-main">
                  <strong>{item.title}</strong>
                  {item.subtitle && <em>{item.subtitle}</em>}
                </span>
                <StatusChip status={item.status} />
                <span className="admin-row-date">{formatDate(item.updatedAt)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
