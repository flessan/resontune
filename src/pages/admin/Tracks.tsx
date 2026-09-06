/** Tracks list — search, filter, missing-audio view, quick publish. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDuration } from '@/lib/format';
import { Artwork } from '@/components/Artwork';
import { IconPlus } from '@/components/Icons';
import { hostOf } from '@/lib/validation';
import { useCatalogRole } from './AdminLayout';
import { AdminEmpty, AdminSearch, StatusChip, StatusFilter } from './ui';
import type { AdminTrack } from './types';

export default function Tracks() {
  const { canEdit } = useCatalogRole();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [refresh, setRefresh] = useState(0);
  const missingAudio = search.get('missingAudio') === '1';

  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (missingAudio) params.set('missingAudio', '1');
    params.set('limit', '60');
    return `/admin/tracks?${params.toString()}`;
  }, [q, status, missingAudio]);

  const { data, loading } = useFetch<{ tracks: AdminTrack[] }>(path, [refresh]);

  const togglePublish = async (track: AdminTrack) => {
    const next = track.status === 'published' ? 'unlisted' : 'published';
    try {
      await api.patch(`/admin/tracks/${track.id}`, { status: next });
      toast(`${track.title}: ${next === 'published' ? 'published' : 'unlisted'}.`);
      setRefresh((n) => n + 1);
    } catch (err: any) {
      toast(err?.message ?? 'Could not change the state.');
    }
  };

  return (
    <>
      <div className="admin-toolbar">
        <AdminSearch value={q} onChange={setQ} placeholder="Search tracks or artists" />
        <StatusFilter value={status} onChange={setStatus} />
        <div className="admin-toolbar-end">
          <button
            className={`pill ${missingAudio ? 'active' : ''}`}
            onClick={() => {
              const next = new URLSearchParams(search);
              if (missingAudio) next.delete('missingAudio');
              else next.set('missingAudio', '1');
              setSearch(next, { replace: true });
            }}
          >
            No audio URL
          </button>
          {canEdit && (
            <button className="btn small primary" onClick={() => navigate('/admin/tracks/new')}>
              <IconPlus width={14} height={14} /> New track
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.tracks.length ? (
        <AdminEmpty
          title={q || status || missingAudio ? 'No tracks match' : 'No tracks yet'}
          body={
            q || status || missingAudio
              ? 'Try a different search or clear the filters.'
              : 'Add a track with its externally hosted audio URL — ResonTune stores the address you verified, not the file.'
          }
          action={canEdit && !q && !status && !missingAudio ? <Link className="btn small primary" to="/admin/tracks/new">Create a track</Link> : undefined}
        />
      ) : (
        <div className="admin-list">
          {data.tracks.map((t) => (
            <div key={t.id} className="admin-row">
              <span className="admin-row-art">
                <Artwork src={t.artworkUrl ?? t.inheritedArtworkUrl} alt="" />
              </span>
              <Link to={`/admin/tracks/${t.id}`} className="admin-row-main">
                <strong>{t.title}</strong>
                <em>
                  {t.artist?.name ?? 'Unknown artist'}
                  {t.release ? ` · ${t.release.title}` : ''}
                  {t.audioUrl ? ` · ${hostOf(t.audioUrl)}` : ''}
                </em>
              </Link>
              {!t.audioUrl && <span className="warn-chip">no audio</span>}
              <span className="admin-row-counts">{formatDuration(t.duration)}</span>
              <StatusChip status={t.status} />
              <span className="admin-row-date">{formatDate(t.updatedAt)}</span>
              {canEdit && (
                <button className="btn small" onClick={() => void togglePublish(t)}>
                  {t.status === 'published' ? 'Unlist' : 'Publish'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
