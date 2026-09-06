import { useState } from 'react';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/toast';

interface Submission {
  id: string;
  status: string;
  payload: Record<string, string>;
  moderatorNote: string | null;
  internalNote: string | null;
  submitterHandle: string | null;
  createdAt: string;
}

const STATUSES = ['pending', 'reviewing', 'approved', 'published', 'rejected'] as const;

export default function Moderation() {
  const user = useAuth((s) => s.user);
  const [status, setStatus] = useState<string>('pending');
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useFetch<{ submissions: Submission[] }>(
    user && (user.role === 'moderator' || user.role === 'admin') ? `/moderation/queue?status=${status}` : null,
    [status, refresh, user?.id],
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});

  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Moderator access required</h3>
          <p>This area is for the review team.</p>
        </div>
      </div>
    );
  }

  const decide = async (id: string, action: 'reviewing' | 'approve' | 'publish' | 'reject') => {
    try {
      await api.post(`/moderation/queue/${id}`, {
        action,
        note: notes[id] || undefined,
        internalNote: internalNotes[id] || undefined,
      });
      toast(
        action === 'publish' ? 'Published to the catalog'
        : action === 'approve' ? 'Approved — ready to publish'
        : action === 'reject' ? 'Rejected'
        : 'Marked as reviewing',
      );
      setRefresh((n) => n + 1);
    } catch (e: any) {
      toast(e.message);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Moderation</h1>
      <p className="page-sub">
        Review community submissions. Lifecycle: pending → reviewing → approved
        → published. Publishing creates the artist, release, track and source
        records in the public catalog. Internal notes never leave this page.
      </p>

      <div className="pill-row" style={{ marginBottom: 24 }}>
        {STATUSES.map((s) => (
          <button key={s} className={`pill ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-page"><span className="spin" /></div> : !data?.submissions.length ? (
        <div className="empty"><h3>Queue is clear</h3><p>No {status} submissions right now.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.submissions.map((s) => (
            <div key={s.id} style={{ borderRadius: 'var(--shape-md)', padding: 20, background: 'var(--surface-container-low)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <strong style={{ fontSize: 15, fontWeight: 600 }}>
                    {s.payload.trackTitle}
                  </strong>
                  <span style={{ color: 'var(--ink-muted)' }}> — {s.payload.artistName}</span>
                </div>
                <span className={`status-badge ${s.status}`}>{s.status}</span>
              </div>
              <table className="simple" style={{ marginBottom: 12 }}>
                <tbody>
                  {s.payload.albumTitle && <tr><td style={{ width: 130, color: 'var(--ink-muted)' }}>Release</td><td>{s.payload.albumTitle}</td></tr>}
                  {s.payload.genre && <tr><td style={{ color: 'var(--ink-muted)' }}>Genre</td><td>{s.payload.genre}</td></tr>}
                  <tr><td style={{ color: 'var(--ink-muted)' }}>License</td><td>{s.payload.licenseId}</td></tr>
                  <tr><td style={{ color: 'var(--ink-muted)' }}>Rights holder</td><td>{s.payload.rightsHolder}</td></tr>
                  <tr>
                    <td style={{ color: 'var(--ink-muted)' }}>Audio URL</td>
                    <td style={{ wordBreak: 'break-all' }}>
                      <a href={s.payload.audioUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        {s.payload.audioUrl}
                      </a>
                    </td>
                  </tr>
                  {s.payload.description && <tr><td style={{ color: 'var(--ink-muted)' }}>Description</td><td>{s.payload.description}</td></tr>}
                  <tr><td style={{ color: 'var(--ink-muted)' }}>Submitted</td><td>{s.submitterHandle ?? 'unknown'} · {formatDate(s.createdAt)}</td></tr>
                </tbody>
              </table>
              {s.payload.audioUrl && (
                <audio controls preload="none" src={s.payload.audioUrl} style={{ width: '100%', marginBottom: 12 }}>
                  Your browser can't preview this audio.
                </audio>
              )}
              {(s.status === 'pending' || s.status === 'reviewing' || s.status === 'approved') && (
                <>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor={`note-${s.id}`}>Moderator note (sent to the submitter)</label>
                    <input
                      id={`note-${s.id}`}
                      type="text"
                      maxLength={600}
                      value={notes[s.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor={`inote-${s.id}`}>Internal note (moderation team only — never shown publicly)</label>
                    <input
                      id={`inote-${s.id}`}
                      type="text"
                      maxLength={1000}
                      value={internalNotes[s.id] ?? ''}
                      onChange={(e) => setInternalNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {s.status === 'pending' && (
                      <button className="btn small" onClick={() => void decide(s.id, 'reviewing')}>Start reviewing</button>
                    )}
                    {(s.status === 'pending' || s.status === 'reviewing') && (
                      <>
                        <button className="btn small" onClick={() => void decide(s.id, 'approve')}>Approve</button>
                        <button className="btn small danger" onClick={() => void decide(s.id, 'reject')}>Reject</button>
                      </>
                    )}
                    <button className="btn primary small" onClick={() => void decide(s.id, 'publish')}>Publish to catalog</button>
                  </div>
                </>
              )}
              {s.moderatorNote && s.status !== 'pending' && (
                <div className="note-card" style={{ marginTop: 8 }}>“{s.moderatorNote}”</div>
              )}
              {s.internalNote && (
                <div className="note-card" style={{ marginTop: 8, opacity: 0.75 }}>
                  <strong>Internal:</strong> {s.internalNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
