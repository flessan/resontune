/**
 * Create / edit a track.
 *
 * This is where the manual media-hosting model lives: an administrator has
 * already decided where the approved audio and artwork are hosted, verified
 * them, and pastes the direct URLs here. ResonTune validates their shape,
 * lets the admin preview them in their *own* browser, and stores the
 * addresses - it never uploads, fetches or mirrors the media.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDate } from '@/lib/format';
import { urlError } from '@/lib/validation';
import { useCatalogRole } from './AdminLayout';
import { ConfirmButton, Field, LinksEditor, MediaUrlField, StatusChip } from './ui';
import {
  SOURCE_LABEL, STATUSES, STATUS_LABEL,
  type AdminArtist, type AdminLicense, type AdminRelease, type AdminTrack,
  type CatalogSource, type CatalogStatus,
} from './types';

interface Draft {
  title: string;
  slug: string;
  artistId: string;
  releaseId: string;
  trackNo: string;
  duration: string;
  genres: string;
  description: string;
  audioUrl: string;
  externalUrl: string;
  artworkUrl: string;
  explicit: boolean;
  licenseId: string;
  rightsHolder: string;
  credits: string;
  attributionText: string;
  territory: string;
  rightsNotes: string;
  streamingPermission: boolean;
  distributionPermission: boolean;
  sourceType: CatalogSource;
  status: CatalogStatus;
  links: { provider: string; label: string; url: string }[];
}

const blank: Draft = {
  title: '', slug: '', artistId: '', releaseId: '', trackNo: '', duration: '', genres: '',
  description: '', audioUrl: '', externalUrl: '', artworkUrl: '', explicit: false,
  licenseId: '', rightsHolder: '', credits: '', attributionText: '', territory: 'worldwide',
  rightsNotes: '', streamingPermission: true, distributionPermission: false,
  sourceType: 'community', status: 'published', links: [],
};

/** "3:41" or "221" → seconds. */
function parseDuration(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(\d+):([0-5]?\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatDurationInput(seconds: number | null): string {
  if (seconds == null) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function TrackEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { canEdit } = useCatalogRole();

  const [draft, setDraft] = useState<Draft>({
    ...blank,
    artistId: search.get('artistId') ?? '',
    releaseId: search.get('releaseId') ?? '',
  });
  const [track, setTrack] = useState<AdminTrack | null>(null);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [releases, setReleases] = useState<AdminRelease[]>([]);
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<{ artists: AdminArtist[] }>('/admin/artists?limit=100').then((r) => setArtists(r.artists)),
      api.get<{ releases: AdminRelease[] }>('/admin/releases?limit=100').then((r) => setReleases(r.releases)),
      api.get<{ licenses: AdminLicense[] }>('/admin/licenses').then((r) => setLicenses(r.licenses)),
    ]).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    setLoading(true);
    api.get<{ track: AdminTrack }>(`/admin/tracks/${id}`)
      .then(({ track: t }) => {
        if (!alive) return;
        setTrack(t);
        setDraft({
          title: t.title,
          slug: t.slug,
          artistId: t.artistId,
          releaseId: t.releaseId ?? '',
          trackNo: t.trackNo == null ? '' : String(t.trackNo),
          duration: formatDurationInput(t.duration),
          genres: t.genres.map((g) => g.name).join(', '),
          description: t.description ?? '',
          audioUrl: t.audioUrl ?? '',
          externalUrl: t.externalUrl ?? '',
          artworkUrl: t.artworkUrl ?? '',
          explicit: t.explicit,
          licenseId: t.licenseId ?? '',
          rightsHolder: t.rightsHolder ?? '',
          credits: t.credits ?? '',
          attributionText: t.attributionText ?? '',
          territory: t.territory ?? 'worldwide',
          rightsNotes: t.rightsNotes ?? '',
          streamingPermission: t.streamingPermission,
          distributionPermission: t.distributionPermission,
          sourceType: t.sourceType,
          status: t.status,
          links: t.links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
        });
      })
      .catch(() => setError('Could not load that track.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, isNew]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const releasesForArtist = useMemo(
    () => releases.filter((r) => !draft.artistId || r.artistId === draft.artistId),
    [releases, draft.artistId],
  );

  const audioProblem = urlError(draft.audioUrl, { requirePath: true });
  const artProblem = urlError(draft.artworkUrl, { requirePath: true });
  const externalProblem = urlError(draft.externalUrl);
  const durationProblem =
    draft.duration && parseDuration(draft.duration) == null ? 'Use m:ss or a number of seconds.' : null;
  const linksValid = draft.links.every((l) => !l.url.trim() || !urlError(l.url));
  const noPlayback = !draft.audioUrl.trim() && !draft.externalUrl.trim();
  const canSave =
    canEdit && !saving && draft.title.trim() && draft.artistId &&
    !audioProblem && !artProblem && !externalProblem && !durationProblem && linksValid;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || undefined,
      artistId: draft.artistId,
      releaseId: draft.releaseId || null,
      trackNo: draft.trackNo.trim() ? Number(draft.trackNo) : null,
      duration: parseDuration(draft.duration),
      genres: draft.genres.split(',').map((g) => g.trim()).filter(Boolean),
      description: draft.description.trim() || null,
      audioUrl: draft.audioUrl.trim() || null,
      externalUrl: draft.externalUrl.trim() || null,
      artworkUrl: draft.artworkUrl.trim() || null,
      explicit: draft.explicit,
      licenseId: draft.licenseId || null,
      rightsHolder: draft.rightsHolder.trim() || null,
      credits: draft.credits.trim() || null,
      attributionText: draft.attributionText.trim() || null,
      territory: draft.territory.trim() || 'worldwide',
      rightsNotes: draft.rightsNotes.trim() || null,
      streamingPermission: draft.streamingPermission,
      distributionPermission: draft.distributionPermission,
      sourceType: draft.sourceType,
      status: draft.status,
      links: draft.links.filter((l) => l.url.trim()),
    };
    try {
      if (isNew) {
        const res = await api.post<{ track: AdminTrack }>('/admin/tracks', body);
        toast('Track created.');
        navigate(`/admin/tracks/${res.track.id}`, { replace: true });
      } else {
        const res = await api.patch<{ track: AdminTrack }>(`/admin/tracks/${id}`, body);
        setTrack(res.track);
        setDraft((d) => ({ ...d, slug: res.track.slug }));
        toast('Track saved.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the track.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/admin/tracks/${id}`);
      toast('Track deleted.');
      navigate('/admin/tracks');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete the track.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;

  return (
    <div className="admin-editor">
      <div className="admin-editor-head">
        <div>
          <Link to="/admin/tracks" className="admin-back">← Tracks</Link>
          <h2 className="admin-editor-title">{isNew ? 'New track' : draft.title || 'Track'}</h2>
          {track && (
            <div className="admin-editor-meta">
              <StatusChip status={track.status} /> · updated {formatDate(track.updatedAt)} ·{' '}
              <Link to={`/track/${track.slug}`}>view public page</Link>
            </div>
          )}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="admin-grid">
        <section className="edit-card">
          <h3 className="edit-card-title">Track</h3>
          <Field label="Title">
            <input type="text" maxLength={160} value={draft.title} onChange={(e) => set('title', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Artist">
            <select value={draft.artistId} onChange={(e) => set('artistId', e.target.value)} disabled={!canEdit}>
              <option value="">Choose an artist…</option>
              {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Release" optional hint="Leave empty for a standalone track.">
            <select value={draft.releaseId} onChange={(e) => set('releaseId', e.target.value)} disabled={!canEdit}>
              <option value="">No release</option>
              {releasesForArtist.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </Field>
          <div className="field-pair">
            <Field label="Track number" optional>
              <input type="number" min={0} max={999} value={draft.trackNo} onChange={(e) => set('trackNo', e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="Duration" optional error={durationProblem} hint="m:ss or seconds">
              <input type="text" value={draft.duration} placeholder="3:41" onChange={(e) => set('duration', e.target.value)} disabled={!canEdit} />
            </Field>
          </div>
          <Field label="Genres" optional hint="Comma separated. New genres are created as needed.">
            <input type="text" value={draft.genres} placeholder="ambient, shoegaze" onChange={(e) => set('genres', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Slug" optional hint="Used in /track/<slug>.">
            <input type="text" maxLength={80} value={draft.slug} onChange={(e) => set('slug', e.target.value)} disabled={!canEdit} spellCheck={false} />
          </Field>
          <Field label="Description" optional>
            <textarea maxLength={2000} value={draft.description} onChange={(e) => set('description', e.target.value)} disabled={!canEdit} />
          </Field>
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">Media (externally hosted)</h3>
          <p className="edit-card-note">
            ResonTune does not host music files or artwork. Paste direct URLs from
            the host you approved - the address is stored, the file stays where it is.
          </p>
          <MediaUrlField
            label="Audio URL"
            kind="audio"
            value={draft.audioUrl}
            onChange={(v) => set('audioUrl', v)}
            hint="A direct https:// link to the audio file, e.g. https://cdn.example.com/music/into-the-night.mp3"
          />
          <MediaUrlField
            label="Artwork URL"
            kind="image"
            value={draft.artworkUrl}
            onChange={(v) => set('artworkUrl', v)}
            hint={track?.inheritedArtworkUrl ? 'Empty: the release artwork is used.' : 'Optional - the release artwork is inherited when empty.'}
          />
          <Field
            label="Official external page"
            optional
            error={externalProblem}
            hint="Used when there is no streamable file: playback opens the official page instead."
          >
            <input
              type="url" maxLength={500} value={draft.externalUrl} placeholder="https://artist.bandcamp.com/track/…"
              onChange={(e) => set('externalUrl', e.target.value)} disabled={!canEdit} spellCheck={false}
            />
          </Field>
          {noPlayback && (
            <p className="hint hint-warn">
              Without an audio URL or an external page this track cannot be played.
            </p>
          )}
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">Rights</h3>
          <Field label="License">
            <select value={draft.licenseId} onChange={(e) => set('licenseId', e.target.value)} disabled={!canEdit}>
              <option value="">Not recorded</option>
              {licenses.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Rights holder" optional>
            <input type="text" maxLength={160} value={draft.rightsHolder} onChange={(e) => set('rightsHolder', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Attribution text" optional hint="Shown wherever attribution is required.">
            <input type="text" maxLength={300} value={draft.attributionText} onChange={(e) => set('attributionText', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Credits" optional>
            <textarea maxLength={600} value={draft.credits} onChange={(e) => set('credits', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Territory">
            <input type="text" maxLength={60} value={draft.territory} onChange={(e) => set('territory', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Rights notes" optional>
            <textarea maxLength={600} value={draft.rightsNotes} onChange={(e) => set('rightsNotes', e.target.value)} disabled={!canEdit} />
          </Field>
          <label className="field-check">
            <input type="checkbox" checked={draft.streamingPermission} onChange={(e) => set('streamingPermission', e.target.checked)} disabled={!canEdit} />
            <span>Streaming permitted on ResonTune</span>
          </label>
          <label className="field-check">
            <input type="checkbox" checked={draft.distributionPermission} onChange={(e) => set('distributionPermission', e.target.checked)} disabled={!canEdit} />
            <span>Redistribution permitted by the rights holder</span>
          </label>
          <label className="field-check">
            <input type="checkbox" checked={draft.explicit} onChange={(e) => set('explicit', e.target.checked)} disabled={!canEdit} />
            <span>Explicit content</span>
          </label>
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">Publishing</h3>
          <Field label="Status">
            <select value={draft.status} onChange={(e) => set('status', e.target.value as CatalogStatus)} disabled={!canEdit}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Provenance">
            <select value={draft.sourceType} onChange={(e) => set('sourceType', e.target.value as CatalogSource)} disabled={!canEdit}>
              {(Object.keys(SOURCE_LABEL) as CatalogSource[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          {track && (
            <p className="hint">
              {track.playCount} play{track.playCount === 1 ? '' : 's'} · added {formatDate(track.createdAt)}
            </p>
          )}
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">External links</h3>
          <LinksEditor links={draft.links} onChange={(links) => set('links', links)} />
        </section>
      </div>

      <div className="edit-actions">
        <button className="btn primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : isNew ? 'Create track' : 'Save changes'}
        </button>
        {canEdit && !isNew && (
          <button
            className="btn"
            onClick={() => {
              set('status', draft.status === 'published' ? 'unlisted' : 'published');
              toast('Remember to save.');
            }}
          >
            {draft.status === 'published' ? 'Set unlisted' : 'Set published'}
          </button>
        )}
        <Link className="btn" to="/admin/tracks">Cancel</Link>
        {!isNew && canEdit && (
          <ConfirmButton label="Delete track" confirmLabel="Really delete?" onConfirm={() => void remove()} />
        )}
      </div>
    </div>
  );
}
