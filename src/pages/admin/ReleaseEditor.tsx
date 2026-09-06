/** Create / edit a release, including its track order. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDuration } from '@/lib/format';
import { urlError } from '@/lib/validation';
import { useCatalogRole } from './AdminLayout';
import { ArtworkPreview, ConfirmButton, Field, LinksEditor, MediaUrlField, StatusChip } from './ui';
import {
  SOURCE_LABEL, STATUSES, STATUS_LABEL,
  type AdminArtist, type AdminRelease, type CatalogSource, type CatalogStatus,
} from './types';

const TYPES = ['album', 'ep', 'single', 'compilation'] as const;

interface Draft {
  title: string;
  slug: string;
  artistId: string;
  type: (typeof TYPES)[number];
  releasedOn: string;
  description: string;
  artworkUrl: string;
  catalogNo: string;
  sourceType: CatalogSource;
  status: CatalogStatus;
  links: { provider: string; label: string; url: string }[];
}

interface ReleaseTrack {
  id: string; title: string; status: CatalogStatus; trackNo: number | null;
  duration: number | null; sourceCount: number;
}

const blank: Draft = {
  title: '', slug: '', artistId: '', type: 'album', releasedOn: '', description: '',
  artworkUrl: '', catalogNo: '', sourceType: 'community', status: 'published', links: [],
};

export default function ReleaseEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { canEdit } = useCatalogRole();

  const [draft, setDraft] = useState<Draft>({ ...blank, artistId: search.get('artistId') ?? '' });
  const [release, setRelease] = useState<AdminRelease | null>(null);
  const [tracks, setTracks] = useState<ReleaseTrack[]>([]);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ artists: AdminArtist[] }>('/admin/artists?limit=100')
      .then((r) => setArtists(r.artists))
      .catch(() => setArtists([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    setLoading(true);
    api.get<{ release: AdminRelease; tracks: ReleaseTrack[] }>(`/admin/releases/${id}`)
      .then((res) => {
        if (!alive) return;
        setRelease(res.release);
        setTracks(res.tracks);
        setDraft({
          title: res.release.title,
          slug: res.release.slug,
          artistId: res.release.artistId,
          type: res.release.type,
          releasedOn: res.release.releasedOn ? String(res.release.releasedOn).slice(0, 10) : '',
          description: res.release.description ?? '',
          artworkUrl: res.release.artworkUrl ?? '',
          catalogNo: res.release.catalogNo ?? '',
          sourceType: res.release.sourceType,
          status: res.release.status,
          links: res.release.links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
        });
      })
      .catch(() => setError('Could not load that release.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, isNew]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const artProblem = urlError(draft.artworkUrl, { requirePath: true });
  const linksValid = draft.links.every((l) => !l.url.trim() || !urlError(l.url));
  const canSave = canEdit && !saving && draft.title.trim() && draft.artistId && !artProblem && linksValid;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || undefined,
      artistId: draft.artistId,
      type: draft.type,
      releasedOn: draft.releasedOn || null,
      description: draft.description.trim() || null,
      artworkUrl: draft.artworkUrl.trim() || null,
      catalogNo: draft.catalogNo.trim() || null,
      sourceType: draft.sourceType,
      status: draft.status,
      links: draft.links.filter((l) => l.url.trim()),
    };
    try {
      if (isNew) {
        const res = await api.post<{ release: AdminRelease }>('/admin/releases', body);
        toast('Release created.');
        navigate(`/admin/releases/${res.release.id}`, { replace: true });
      } else {
        const res = await api.patch<{ release: AdminRelease }>(`/admin/releases/${id}`, body);
        setRelease(res.release);
        setDraft((d) => ({ ...d, slug: res.release.slug }));
        toast('Release saved.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the release.');
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const next = [...tracks];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTracks(next);
    try {
      await api.post(`/admin/releases/${id}/reorder`, { trackIds: next.map((t) => t.id) });
    } catch {
      toast('Could not save the new order.');
    }
  };

  const remove = async () => {
    try {
      await api.del(`/admin/releases/${id}`);
      toast('Release deleted. Its tracks are now standalone.');
      navigate('/admin/releases');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete the release.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;

  return (
    <div className="admin-editor">
      <div className="admin-editor-head">
        <div>
          <Link to="/admin/releases" className="admin-back">← Releases</Link>
          <h2 className="admin-editor-title">{isNew ? 'New release' : draft.title || 'Release'}</h2>
          {release && (
            <div className="admin-editor-meta">
              <StatusChip status={release.status} /> · updated {formatDate(release.updatedAt)} ·{' '}
              <Link to={`/release/${release.slug}`}>view public page</Link>
            </div>
          )}
        </div>
        {draft.artworkUrl && !artProblem && <ArtworkPreview url={draft.artworkUrl} size={72} />}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="admin-grid">
        <section className="edit-card">
          <h3 className="edit-card-title">Release</h3>
          <Field label="Title">
            <input type="text" maxLength={160} value={draft.title} onChange={(e) => set('title', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Artist">
            <select value={draft.artistId} onChange={(e) => set('artistId', e.target.value)} disabled={!canEdit}>
              <option value="">Choose an artist…</option>
              {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Slug" optional hint="Used in /release/<slug>.">
            <input type="text" maxLength={80} value={draft.slug} onChange={(e) => set('slug', e.target.value)} disabled={!canEdit} spellCheck={false} />
          </Field>
          <Field label="Type">
            <select value={draft.type} onChange={(e) => set('type', e.target.value as Draft['type'])} disabled={!canEdit}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Release date" optional>
            <input type="date" value={draft.releasedOn} onChange={(e) => set('releasedOn', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Catalog number" optional hint="e.g. RSN-001 for ResonTune Originals.">
            <input type="text" maxLength={40} value={draft.catalogNo} onChange={(e) => set('catalogNo', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Description" optional>
            <textarea maxLength={2000} value={draft.description} onChange={(e) => set('description', e.target.value)} disabled={!canEdit} />
          </Field>
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">Artwork & publishing</h3>
          <MediaUrlField
            label="Artwork URL"
            kind="image"
            value={draft.artworkUrl}
            onChange={(v) => set('artworkUrl', v)}
            hint="Cover art hosted wherever you chose. ResonTune never uploads or copies it."
          />
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
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">External links</h3>
          <LinksEditor links={draft.links} onChange={(links) => set('links', links)} />
        </section>

        {!isNew && (
          <section className="edit-card">
            <h3 className="edit-card-title">Tracks</h3>
            {tracks.length === 0 ? (
              <p className="hint">No tracks on this release yet.</p>
            ) : (
              <div className="admin-mini-list">
                {tracks.map((t, i) => (
                  <div key={t.id} className="admin-mini-row">
                    <span className="admin-track-no">{t.trackNo ?? i + 1}</span>
                    <Link to={`/admin/tracks/${t.id}`} style={{ flex: 1 }}>{t.title}</Link>
                    {t.sourceCount === 0 && <span className="warn-chip">no audio</span>}
                    <span className="hint">{formatDuration(t.duration)}</span>
                    <StatusChip status={t.status} />
                    {canEdit && (
                      <span className="admin-order">
                        <button className="icon-btn" aria-label="Move up" onClick={() => void move(i, -1)} disabled={i === 0}>↑</button>
                        <button className="icon-btn" aria-label="Move down" onClick={() => void move(i, 1)} disabled={i === tracks.length - 1}>↓</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <Link className="btn small" style={{ marginTop: 12 }} to={`/admin/tracks/new?releaseId=${id}&artistId=${draft.artistId}`}>
                Add a track
              </Link>
            )}
          </section>
        )}
      </div>

      <div className="edit-actions">
        <button className="btn primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : isNew ? 'Create release' : 'Save changes'}
        </button>
        <Link className="btn" to="/admin/releases">Cancel</Link>
        {!isNew && canEdit && (
          <ConfirmButton label="Delete release" confirmLabel="Really delete?" onConfirm={() => void remove()} />
        )}
      </div>
    </div>
  );
}
