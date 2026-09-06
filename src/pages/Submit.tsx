import { useState } from 'react';
import { useFetch } from '@/lib/useFetch';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/toast';

interface Submission {
  id: string;
  status: 'pending' | 'reviewing' | 'approved' | 'published' | 'rejected';
  payload: Record<string, string>;
  moderatorNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const EMPTY = {
  artistName: '', trackTitle: '', albumTitle: '', genre: '', description: '',
  artworkUrl: '', audioUrl: '', lyrics: '', licenseId: 'cc-by-4.0',
  rightsHolder: '', externalLinks: '',
};

export default function Submit() {
  const user = useAuth((s) => s.user);
  const [form, setForm] = useState({ ...EMPTY });
  const [rights, setRights] = useState(false);
  const [distribution, setDistribution] = useState(false);
  const [rightsNotes, setRightsNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data: mine } = useFetch<{ submissions: Submission[] }>(user ? '/me/submissions' : null, [user?.id, refresh]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!rights) {
      setError('You must confirm you hold or represent the rights to this music.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/me/submissions', {
        ...form,
        rightsConfirmed: true,
        streamingPermission: true,
        distributionPermission: distribution,
        rightsNotes,
      });
      setOk(true);
      setForm({ ...EMPTY });
      setRights(false);
      setDistribution(false);
      setRightsNotes('');
      setRefresh((n) => n + 1);
      toast('Submission received — thank you!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Submit music</h1>
      <p className="page-sub">
        ResonTune's catalog is built by its community. Submit music you created
        or hold the rights to — a moderator reviews every submission before it
        appears in the catalog.
      </p>

      {!user ? (
        <div className="empty">
          <h3>Sign in to submit</h3>
          <p>Submissions are tied to an account so you can follow their review status.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', gap: 40 }}>
          <form onSubmit={submit} style={{ maxWidth: 560 }}>
            {error && <div className="form-error" role="alert">{error}</div>}
            {ok && <div className="form-ok" role="status">Submission received. You can track its status on the right.</div>}

            <div className="field">
              <label htmlFor="s-artist">Artist *</label>
              <input id="s-artist" type="text" required maxLength={120} value={form.artistName} onChange={set('artistName')} />
            </div>
            <div className="field">
              <label htmlFor="s-title">Track title *</label>
              <input id="s-title" type="text" required maxLength={160} value={form.trackTitle} onChange={set('trackTitle')} />
            </div>
            <div className="field">
              <label htmlFor="s-album">Album / release</label>
              <input id="s-album" type="text" maxLength={160} value={form.albumTitle} onChange={set('albumTitle')} />
            </div>
            <div className="field">
              <label htmlFor="s-genre">Genre</label>
              <input id="s-genre" type="text" maxLength={40} value={form.genre} onChange={set('genre')} placeholder="e.g. Ambient" />
            </div>
            <div className="field">
              <label htmlFor="s-desc">Description</label>
              <textarea id="s-desc" maxLength={1200} value={form.description} onChange={set('description')} />
            </div>
            <div className="field">
              <label htmlFor="s-artwork">Artwork URL</label>
              <input id="s-artwork" type="url" maxLength={500} value={form.artworkUrl} onChange={set('artworkUrl')} placeholder="https://…" />
              <p className="hint">Square image, ideally 1000×1000 or larger.</p>
            </div>
            <div className="field">
              <label htmlFor="s-audio">Audio source URL *</label>
              <input id="s-audio" type="url" required maxLength={500} value={form.audioUrl} onChange={set('audioUrl')} placeholder="https://…/track.mp3" />
              <p className="hint">
                A direct URL to an audio file you are allowed to distribute
                (your own hosting, Bandcamp download link you control, etc.).
                Never submit links that bypass another platform's protections.
              </p>
            </div>
            <div className="field">
              <label htmlFor="s-lyrics">Lyrics</label>
              <textarea id="s-lyrics" maxLength={12000} value={form.lyrics} onChange={set('lyrics')} />
            </div>
            <div className="field">
              <label htmlFor="s-license">License *</label>
              <select id="s-license" value={form.licenseId} onChange={set('licenseId')}>
                <option value="cc0-1.0">CC0 1.0 (Public Domain)</option>
                <option value="cc-by-4.0">CC BY 4.0</option>
                <option value="cc-by-sa-4.0">CC BY-SA 4.0</option>
                <option value="cc-by-nc-4.0">CC BY-NC 4.0</option>
                <option value="all-rights-reserved">All rights reserved (streaming permitted)</option>
              </select>
              <p className="hint">Pick the license the rights holder actually chose. ResonTune never assigns licenses.</p>
            </div>
            <div className="field">
              <label htmlFor="s-rights">Creator / rights holder *</label>
              <input id="s-rights" type="text" required maxLength={200} value={form.rightsHolder} onChange={set('rightsHolder')} />
            </div>
            <div className="field">
              <label htmlFor="s-links">External links</label>
              <input id="s-links" type="text" maxLength={1000} value={form.externalLinks} onChange={set('externalLinks')} placeholder="Bandcamp, website, socials…" />
            </div>
            <div className="field field-check">
              <input id="s-dist" type="checkbox" checked={distribution} onChange={(e) => setDistribution(e.target.checked)} />
              <label htmlFor="s-dist" style={{ fontWeight: 400, margin: 0 }}>
                Listeners may also share/redistribute this recording under the chosen
                license (leave unchecked for streaming-only).
              </label>
            </div>
            <div className="field">
              <label htmlFor="s-rnotes">Rights notes (optional)</label>
              <input
                id="s-rnotes" type="text" maxLength={600} value={rightsNotes}
                onChange={(e) => setRightsNotes(e.target.value)}
                placeholder="e.g. sample clearances, co-writers, territory limits"
              />
            </div>
            <div className="field field-check">
              <input id="s-confirm" type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
              <label htmlFor="s-confirm" style={{ fontWeight: 400, margin: 0 }}>
                I confirm that I am the creator or an authorized representative of the
                rights holder, and that streaming this music on ResonTune is permitted.
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>

          <aside>
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2 className="section-title" style={{ fontSize: 17 }}>Your submissions</h2>
            </div>
            {!mine?.submissions.length ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13.5 }}>Nothing submitted yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mine.submissions.map((s) => (
                  <div key={s.id} style={{ borderRadius: 'var(--shape-md)', padding: 14, background: 'var(--surface-container-low)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: 13.5 }}>{s.payload.trackTitle}</strong>
                      <span className={`status-badge ${s.status}`}>{s.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                      {s.payload.artistName} · {formatDate(s.createdAt)}
                    </div>
                    {s.moderatorNote && (
                      <div className="note-card" style={{ marginTop: 8, fontSize: 12.5 }}>
                        Moderator: “{s.moderatorNote}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
