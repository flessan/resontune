/**
 * Catalog administration — content states for the real catalog.
 * Submission intake happens in external community channels, so this page
 * only manages what actually exists: published tracks and their states
 * (published / unlisted / taken down / archived), with a full audit log.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/toast';

interface AdminTrack {
  id: string;
  slug: string;
  title: string;
  status: string;
  sourceType: string;
  createdAt: string;
  artist: { name: string; slug: string };
}

interface Takedown {
  id: string;
  reason: string;
  requestedBy: string | null;
  createdAt: string;
  actorHandle: string | null;
  trackTitle: string | null;
  trackSlug: string | null;
}

const STATES = ['published', 'unlisted', 'taken_down', 'archived'] as const;
const STATE_LABEL: Record<string, string> = {
  published: 'Published', unlisted: 'Unlisted', taken_down: 'Taken down', archived: 'Archived',
};

export default function Moderation() {
  const user = useAuth((s) => s.user);
  const canModerate = user && (user.role === 'moderator' || user.role === 'admin');
  const [filter, setFilter] = useState<string>('');
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useFetch<{ tracks: AdminTrack[] }>(
    canModerate ? `/moderation/tracks${filter ? `?status=${filter}` : ''}` : null,
    [filter, refresh, user?.id],
  );
  const { data: audit } = useFetch<{ takedowns: Takedown[] }>(
    canModerate ? '/moderation/takedowns' : null,
    [refresh, user?.id],
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});

  if (!canModerate) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Moderator access required</h3>
          <p>This area is for catalog administrators.</p>
        </div>
      </div>
    );
  }

  const setState = async (track: AdminTrack, status: string) => {
    const reason = (reasons[track.id] ?? '').trim();
    if (reason.length < 3) return toast('Add a short reason first — every state change is audited.');
    try {
      await api.post(`/moderation/tracks/${track.id}/state`, { status, reason });
      toast(`${track.title}: ${STATE_LABEL[status]}.`);
      setReasons((n) => ({ ...n, [track.id]: '' }));
      setRefresh((n) => n + 1);
    } catch (e: any) {
      toast(e.message ?? 'State change failed.');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Catalog administration</h1>
      <p className="page-sub">
        Content states for the published catalog. Music intake happens in the
        community channels — see <Link to="/submit">Release music</Link>.
      </p>

      <div className="seg-row" style={{ marginBottom: 18 }}>
        <button className={`pill ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>All</button>
        {STATES.map((s) => (
          <button key={s} className={`pill ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {STATE_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-page"><span className="spin" /></div>
      ) : !data?.tracks.length ? (
        <div className="empty">
          <h3>No catalog entries{filter ? ` in “${STATE_LABEL[filter]}”` : ''}</h3>
          <p>When music is published to the catalog it can be administered here.</p>
        </div>
      ) : (
        <div className="mod-list">
          {data.tracks.map((t) => (
            <div key={t.id} className="mod-card">
              <div className="mod-card-head">
                <div>
                  <Link to={`/track/${t.slug}`} style={{ fontWeight: 600 }}>{t.title}</Link>
                  <span style={{ color: 'var(--on-surface-muted)' }}> — {t.artist.name}</span>
                </div>
                <span className={`status-chip status-${t.status}`}>{STATE_LABEL[t.status] ?? t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-faint)', marginBottom: 8 }}>
                {t.sourceType === 'original' ? 'Original' : 'Community'} · added {formatDate(t.createdAt)}
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Reason for state change (audited)"
                  value={reasons[t.id] ?? ''}
                  onChange={(e) => setReasons((n) => ({ ...n, [t.id]: e.target.value }))}
                  maxLength={600}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATES.filter((s) => s !== t.status).map((s) => (
                  <button key={s} className="btn small" onClick={() => void setState(t, s)}>
                    {STATE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {audit && audit.takedowns.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 34 }}>
            <h2 className="section-title">Audit log</h2>
            <span className="section-note">every state change, permanently recorded</span>
          </div>
          <div className="mod-list">
            {audit.takedowns.map((e) => (
              <div key={e.id} className="mod-card" style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 13 }}>
                  {e.trackSlug ? <Link to={`/track/${e.trackSlug}`}>{e.trackTitle}</Link> : e.trackTitle ?? 'Removed entry'}
                  <span style={{ color: 'var(--on-surface-muted)' }}> — {e.reason}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--on-surface-faint)', marginTop: 2 }}>
                  {e.actorHandle ? `by ${e.actorHandle}` : ''} · {formatDate(e.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
