/** Create / edit an artist record. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/stores/toast';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/format';
import { urlError } from '@/lib/validation';
import { useCatalogRole } from './AdminLayout';
import { ConfirmButton, Field, LinksEditor, MediaUrlField, StatusChip } from './ui';
import { SOURCE_LABEL, STATUSES, STATUS_LABEL, type AdminArtist, type AdminRelease, type CatalogSource, type CatalogStatus } from './types';

interface Draft {
  name: string;
  slug: string;
  bio: string;
  imageUrl: string;
  location: string;
  sourceType: CatalogSource;
  status: CatalogStatus;
  userId: string;
  links: { provider: string; label: string; url: string }[];
}

const blank: Draft = {
  name: '', slug: '', bio: '', imageUrl: '', location: '',
  sourceType: 'community', status: 'published', userId: '', links: [],
};

export default function ArtistEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { canEdit } = useCatalogRole();

  const [draft, setDraft] = useState<Draft>(blank);
  const [artist, setArtist] = useState<AdminArtist | null>(null);
  const [releases, setReleases] = useState<Pick<AdminRelease, 'id' | 'title' | 'status' | 'releasedOn'>[]>([]);
  const [tracks, setTracks] = useState<{ id: string; title: string; status: CatalogStatus }[]>([]);
  const [accountQuery, setAccountQuery] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    setLoading(true);
    api.get<{ artist: AdminArtist; releases: any[]; tracks: any[] }>(`/admin/artists/${id}`)
      .then((res) => {
        if (!alive) return;
        setArtist(res.artist);
        setReleases(res.releases);
        setTracks(res.tracks);
        setDraft({
          name: res.artist.name,
          slug: res.artist.slug,
          bio: res.artist.bio ?? '',
          imageUrl: res.artist.imageUrl ?? '',
          location: res.artist.location ?? '',
          sourceType: res.artist.sourceType,
          status: res.artist.status,
          userId: res.artist.userId ?? '',
          links: res.artist.links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
        });
        setAccountQuery(res.artist.userHandle ? `@${res.artist.userHandle}` : '');
      })
      .catch(() => setError('Could not load that artist.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, isNew]);

  useEffect(() => {
    const term = accountQuery.replace(/^@/, '').trim();
    if (term.length < 2) return void setAccounts([]);
    const timer = window.setTimeout(() => {
      api.get<{ users: { id: string; username: string; displayName: string }[] }>(
        `/admin/users/search?q=${encodeURIComponent(term)}`,
      ).then((r) => setAccounts(r.users)).catch(() => setAccounts([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [accountQuery]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const imageProblem = urlError(draft.imageUrl, { requirePath: true });
  const linksValid = draft.links.every((l) => !l.url.trim() || !urlError(l.url));
  const canSave = canEdit && !saving && draft.name.trim().length > 0 && !imageProblem && linksValid;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body = {
      name: draft.name.trim(),
      slug: draft.slug.trim() || undefined,
      bio: draft.bio.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      location: draft.location.trim() || null,
      sourceType: draft.sourceType,
      status: draft.status,
      userId: draft.userId || null,
      links: draft.links.filter((l) => l.url.trim()),
    };
    try {
      if (isNew) {
        const res = await api.post<{ artist: AdminArtist }>('/admin/artists', body);
        toast('Artist created.');
        navigate(`/admin/artists/${res.artist.id}`, { replace: true });
      } else {
        const res = await api.patch<{ artist: AdminArtist }>(`/admin/artists/${id}`, body);
        setArtist(res.artist);
        setDraft((d) => ({ ...d, slug: res.artist.slug }));
        toast('Artist saved.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the artist.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/admin/artists/${id}`);
      toast('Artist deleted.');
      navigate('/admin/artists');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete the artist.');
    }
  };

  if (loading) return <div className="loading-page"><span className="spin" /></div>;

  return (
    <div className="admin-editor">
      <div className="admin-editor-head">
        <div>
          <Link to="/admin/artists" className="admin-back">← Artists</Link>
          <h2 className="admin-editor-title">{isNew ? 'New artist' : draft.name || 'Artist'}</h2>
          {artist && (
            <div className="admin-editor-meta">
              <StatusChip status={artist.status} /> · updated {formatDate(artist.updatedAt)} ·{' '}
              <Link to={`/artist/${artist.slug}`}>view public page</Link>
            </div>
          )}
        </div>
        <Avatar src={draft.imageUrl || null} name={draft.name || 'Artist'} size={64} />
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="admin-grid">
        <section className="edit-card">
          <h3 className="edit-card-title">Identity</h3>
          <Field label="Name">
            <input type="text" maxLength={120} value={draft.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Slug" optional hint="Used in /artist/<slug>. Generated from the name when empty.">
            <input type="text" maxLength={80} value={draft.slug} onChange={(e) => set('slug', e.target.value)} disabled={!canEdit} spellCheck={false} />
          </Field>
          <Field label="Location" optional>
            <input type="text" maxLength={80} value={draft.location} onChange={(e) => set('location', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Bio" optional>
            <textarea maxLength={2000} value={draft.bio} onChange={(e) => set('bio', e.target.value)} disabled={!canEdit} />
          </Field>
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">Publishing</h3>
          <Field label="Status">
            <select value={draft.status} onChange={(e) => set('status', e.target.value as CatalogStatus)} disabled={!canEdit}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Provenance" hint="How this artist reached the catalog.">
            <select value={draft.sourceType} onChange={(e) => set('sourceType', e.target.value as CatalogSource)} disabled={!canEdit}>
              {(Object.keys(SOURCE_LABEL) as CatalogSource[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Linked ResonTune account"
            optional
            hint="Artists do not need an account. Linking one lets that user claim this page later."
          >
            <input
              type="text" value={accountQuery} placeholder="Search by username"
              onChange={(e) => { setAccountQuery(e.target.value); if (!e.target.value) set('userId', ''); }}
              disabled={!canEdit}
            />
          </Field>
          {accounts.length > 0 && canEdit && (
            <div className="admin-suggest">
              {accounts.map((u) => (
                <button
                  key={u.id}
                  className={`admin-suggest-item ${draft.userId === u.id ? 'active' : ''}`}
                  onClick={() => { set('userId', u.id); setAccountQuery(`@${u.username}`); setAccounts([]); }}
                >
                  {u.displayName} <em>@{u.username}</em>
                </button>
              ))}
            </div>
          )}
          <MediaUrlField
            label="Artist image URL"
            kind="image"
            value={draft.imageUrl}
            onChange={(v) => set('imageUrl', v)}
            hint="Externally hosted image you have verified. ResonTune stores only the address."
          />
        </section>

        <section className="edit-card">
          <h3 className="edit-card-title">External links</h3>
          <LinksEditor links={draft.links} onChange={(links) => set('links', links)} />
        </section>

        {!isNew && (
          <section className="edit-card">
            <h3 className="edit-card-title">Catalog</h3>
            {releases.length === 0 && tracks.length === 0 ? (
              <p className="hint">No releases or tracks yet.</p>
            ) : (
              <>
                {releases.length > 0 && (
                  <div className="admin-mini-list">
                    {releases.map((r) => (
                      <Link key={r.id} to={`/admin/releases/${r.id}`} className="admin-mini-row">
                        <span>{r.title}</span>
                        <StatusChip status={r.status} />
                      </Link>
                    ))}
                  </div>
                )}
                {tracks.length > 0 && (
                  <div className="admin-mini-list">
                    {tracks.slice(0, 12).map((t) => (
                      <Link key={t.id} to={`/admin/tracks/${t.id}`} className="admin-mini-row">
                        <span>{t.title}</span>
                        <StatusChip status={t.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Link className="btn small" to={`/admin/releases/new?artistId=${id}`}>Add release</Link>
                <Link className="btn small" to={`/admin/tracks/new?artistId=${id}`}>Add track</Link>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="edit-actions">
        <button className="btn primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : isNew ? 'Create artist' : 'Save changes'}
        </button>
        <Link className="btn" to="/admin/artists">Cancel</Link>
        {!isNew && canEdit && (
          <ConfirmButton label="Delete artist" confirmLabel="Really delete?" onConfirm={() => void remove()} />
        )}
      </div>
    </div>
  );
}
