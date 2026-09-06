/** Artists list — search, filter, quick publish, navigate to the editor. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDate } from '@/lib/format';
import { Avatar } from '@/components/Avatar';
import { IconPlus } from '@/components/Icons';
import { useCatalogRole } from './AdminLayout';
import { AdminEmpty, AdminSearch, StatusChip, StatusFilter } from './ui';
import type { AdminArtist } from './types';

export default function Artists() {
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
    return `/admin/artists?${params.toString()}`;
  }, [q, status]);

  const { data, loading } = useFetch<{ artists: AdminArtist[] }>(path, [refresh]);

  const togglePublish = async (artist: AdminArtist) => {
    const next = artist.status === 'published' ? 'unlisted' : 'published';
    try {
      await api.patch(`/admin/artists/${artist.id}`, { status: next });
      toast(`${artist.name}: ${next === 'published' ? 'published' : 'unlisted'}.`);
      setRefresh((n) => n + 1);
    } catch (err: any) {
      toast(err?.message ?? 'Could not change the state.');
    }
  };

  return (
    <>
      <div className="admin-toolbar">
        <AdminSearch value={q} onChange={setQ} placeholder="Search artists" />
        <StatusFilter value={status} onChange={setStatus} />
        <div className="admin-toolbar-end">
          {canEdit && (
            <button className="btn small primary" onClick={() => navigate('/admin/artists/new')}>
              <IconPlus width={14} height={14} /> New artist
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.artists.length ? (
        <AdminEmpty
          title={q || status ? 'No artists match' : 'No artists yet'}
          body={
            q || status
              ? 'Try a different search or clear the filter.'
              : 'Artists can exist without a ResonTune account — create the record, then add releases and tracks.'
          }
          action={canEdit && !q && !status ? <Link className="btn small primary" to="/admin/artists/new">Create an artist</Link> : undefined}
        />
      ) : (
        <div className="admin-list">
          {data.artists.map((a) => (
            <div key={a.id} className="admin-row">
              <Avatar src={a.imageUrl} name={a.name} size={34} />
              <Link to={`/admin/artists/${a.id}`} className="admin-row-main">
                <strong>{a.name}</strong>
                <em>
                  /{a.slug}
                  {a.userHandle ? ` · @${a.userHandle}` : ''}
                  {a.location ? ` · ${a.location}` : ''}
                </em>
              </Link>
              <span className="admin-row-counts">
                {a.releaseCount ?? 0} rel · {a.trackCount ?? 0} trk
              </span>
              <StatusChip status={a.status} />
              <span className="admin-row-date">{formatDate(a.updatedAt)}</span>
              {canEdit && (
                <button className="btn small" onClick={() => void togglePublish(a)}>
                  {a.status === 'published' ? 'Unlist' : 'Publish'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
