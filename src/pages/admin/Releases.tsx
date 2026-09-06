/** Releases list — search, filter, quick publish, navigate to the editor. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDate } from '@/lib/format';
import { Artwork } from '@/components/Artwork';
import { IconPlus } from '@/components/Icons';
import { useCatalogRole } from './AdminLayout';
import { AdminEmpty, AdminSearch, StatusChip, StatusFilter } from './ui';
import type { AdminRelease } from './types';

export default function Releases() {
  const { canEdit } = useCatalogRole();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    params.set('limit', '60');
    return `/admin/releases?${params.toString()}`;
  }, [q, status]);

  const { data, loading } = useFetch<{ releases: AdminRelease[] }>(path, [refresh]);

  const togglePublish = async (release: AdminRelease) => {
    const next = release.status === 'published' ? 'unlisted' : 'published';
    try {
      await api.patch(`/admin/releases/${release.id}`, { status: next });
      toast(`${release.title}: ${next === 'published' ? 'published' : 'unlisted'}.`);
      setRefresh((n) => n + 1);
    } catch (err: any) {
      toast(err?.message ?? 'Could not change the state.');
    }
  };

  return (
    <>
      <div className="admin-toolbar">
        <AdminSearch value={q} onChange={setQ} placeholder="Search releases or artists" />
        <StatusFilter value={status} onChange={setStatus} />
        <div className="admin-toolbar-end">
          {canEdit && (
            <button className="btn small primary" onClick={() => navigate('/admin/releases/new')}>
              <IconPlus width={14} height={14} /> New release
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.releases.length ? (
        <AdminEmpty
          title={q || status ? 'No releases match' : 'No releases yet'}
          body={
            q || status
              ? 'Try a different search or clear the filter.'
              : 'A release groups tracks under one cover. Create the artist first, then the release.'
          }
          action={canEdit && !q && !status ? <Link className="btn small primary" to="/admin/releases/new">Create a release</Link> : undefined}
        />
      ) : (
        <div className="admin-list">
          {data.releases.map((r) => (
            <div key={r.id} className="admin-row">
              <span className="admin-row-art"><Artwork src={r.artworkUrl} alt="" /></span>
              <Link to={`/admin/releases/${r.id}`} className="admin-row-main">
                <strong>{r.title}</strong>
                <em>
                  {r.artist?.name ?? 'Unknown artist'} · {r.type}
                  {r.releasedOn ? ` · ${formatDate(r.releasedOn)}` : ''}
                  {r.catalogNo ? ` · ${r.catalogNo}` : ''}
                </em>
              </Link>
              <span className="admin-row-counts">{r.trackCount ?? 0} trk</span>
              <StatusChip status={r.status} />
              <span className="admin-row-date">{formatDate(r.updatedAt)}</span>
              {canEdit && (
                <button className="btn small" onClick={() => void togglePublish(r)}>
                  {r.status === 'published' ? 'Unlist' : 'Publish'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
