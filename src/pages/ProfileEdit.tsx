/**
 * Profile editor - /profile/edit.
 *
 * Everything here is written through `PATCH /api/me/profile`, which resolves
 * the account from the verified session: the client cannot say whose profile
 * it is editing.
 *
 * The profile photo goes browser → ResonTune server → ImgBB. The ImgBB key
 * lives only on the server; the browser sends bytes to our own endpoint and
 * receives back the hosted URL that gets saved in Neon.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { Avatar } from '@/components/Avatar';
import { IconTrash, IconUpload } from '@/components/Icons';
import {
  AVATAR_MAX_BYTES, avatarFileError, normalizeUsername, urlError, usernameError,
} from '@/lib/validation';
import type { EntityLink, Profile } from '@/lib/types';

interface Draft {
  displayName: string;
  username: string;
  bio: string;
  location: string;
  websiteUrl: string;
  links: EntityLink[];
}

const emptyDraft: Draft = { displayName: '', username: '', bio: '', location: '', websiteUrl: '', links: [] };

export default function ProfileEdit() {
  const user = useAuth((s) => s.user);
  const loaded = useAuth((s) => s.loaded);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameNote, setUsernameNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get<{ profile: Profile }>('/me')
      .then(({ profile: p }) => {
        if (!alive) return;
        setProfile(p);
        setDraft({
          displayName: p.displayName ?? '',
          username: p.username ?? '',
          bio: p.bio ?? '',
          location: p.location ?? '',
          websiteUrl: p.websiteUrl ?? '',
          links: p.links ?? [],
        });
      })
      .catch(() => setError('Could not load your profile.'));
    return () => { alive = false; };
  }, [user?.id]);

  /* live username availability (debounced) */
  useEffect(() => {
    if (!user || !draft.username) return;
    const normalized = normalizeUsername(draft.username);
    if (normalized === profile?.username) return void setUsernameNote(null);
    const local = usernameError(draft.username);
    if (local) return void setUsernameNote(local);
    const timer = window.setTimeout(() => {
      api.get<{ available: boolean; reason: string | null }>(
        `/me/username-available?username=${encodeURIComponent(normalized)}`,
      )
        .then((r) => setUsernameNote(r.available ? `@${normalized} is available` : r.reason))
        .catch(() => setUsernameNote(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.username, profile?.username, user?.id]);

  if (!loaded) return <div className="loading-page"><span className="spin" /></div>;
  if (!user) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Sign in to edit your profile</h3>
          <p>Your ResonTune profile lives with your account.</p>
        </div>
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const websiteProblem = urlError(draft.websiteUrl);
  const linkProblems = draft.links.map((l) => urlError(l.url));
  const usernameProblem = usernameError(draft.username);
  const canSave =
    !saving && draft.displayName.trim().length > 0 && !usernameProblem &&
    !websiteProblem && linkProblems.every((p) => !p);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ profile: Profile }>('/me/profile', {
        displayName: draft.displayName.trim(),
        username: normalizeUsername(draft.username),
        bio: draft.bio.trim() || null,
        location: draft.location.trim() || null,
        websiteUrl: draft.websiteUrl.trim() || null,
        links: draft.links
          .filter((l) => l.url.trim())
          .map((l) => ({ provider: l.provider || null, label: l.label || null, url: l.url.trim() })),
      });
      await useAuth.getState().refresh();
      toast('Profile saved.');
      navigate(`/u/${res.profile.username}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = () => fileRef.current?.click();

  const uploadPhoto = async (file: File) => {
    const problem = avatarFileError(file);
    if (problem) return toast(problem);
    setUploading(true);
    try {
      const res = await api.upload<{ avatarUrl: string; avatarThumbUrl: string | null }>('/me/avatar', file);
      setProfile((p) => (p ? { ...p, avatarUrl: res.avatarUrl, avatarThumbUrl: res.avatarThumbUrl } : p));
      await useAuth.getState().refresh();
      toast('Profile photo updated.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    try {
      await api.del('/me/avatar');
      setProfile((p) => (p ? { ...p, avatarUrl: null, avatarThumbUrl: null } : p));
      await useAuth.getState().refresh();
      toast('Profile photo removed.');
    } catch {
      toast('Could not remove the photo.');
    }
  };

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Edit profile</h1>
      <p className="page-sub">
        This is your public page at{' '}
        <Link to={`/u/${profile?.username ?? user.handle}`}>/u/{profile?.username ?? user.handle}</Link>.
      </p>

      {error && <div className="form-error">{error}</div>}

      {/* ---------------------------- profile photo --------------------------- */}
      <section className="edit-card">
        <h2 className="edit-card-title">Profile photo</h2>
        <div className="avatar-editor">
          <Avatar src={profile?.avatarUrl} name={draft.displayName || user.displayName} size={88} />
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={pickPhoto} disabled={uploading}>
                <IconUpload width={14} height={14} /> {uploading ? 'Uploading…' : 'Upload photo'}
              </button>
              {profile?.avatarUrl && (
                <button className="btn small" onClick={() => void removePhoto()} disabled={uploading}>
                  <IconTrash width={14} height={14} /> Remove
                </button>
              )}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              JPEG, PNG, WebP or GIF, up to {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB. Photos are
              hosted on ImgBB through ResonTune's server - only the resulting
              image address is stored.
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPhoto(file);
          }}
        />
      </section>

      {/* ------------------------------- identity ----------------------------- */}
      <section className="edit-card">
        <h2 className="edit-card-title">Identity</h2>
        <div className="field">
          <label htmlFor="p-name">Display name</label>
          <input
            id="p-name" type="text" maxLength={60} value={draft.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            placeholder="How you appear across ResonTune"
          />
        </div>
        <div className="field">
          <label htmlFor="p-username">Username</label>
          <div className="input-prefix">
            <span>@</span>
            <input
              id="p-username" type="text" maxLength={24} value={draft.username}
              onChange={(e) => set('username', e.target.value.toLowerCase())}
              onBlur={() => set('username', normalizeUsername(draft.username))}
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
            />
          </div>
          <div className={`hint ${usernameProblem ? 'hint-error' : ''}`}>
            {usernameProblem ?? usernameNote ?? 'Lowercase letters, numbers, dots, dashes and underscores.'}
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-bio">Bio</label>
          <textarea
            id="p-bio" maxLength={600} value={draft.bio}
            onChange={(e) => set('bio', e.target.value)}
            placeholder="What you listen to, what you make, what you're looking for."
          />
          <div className="hint">{draft.bio.length}/600</div>
        </div>
        <div className="field">
          <label htmlFor="p-location">Location <span className="optional">optional</span></label>
          <input
            id="p-location" type="text" maxLength={80} value={draft.location}
            onChange={(e) => set('location', e.target.value)} placeholder="City, country"
          />
        </div>
      </section>

      {/* -------------------------------- links ------------------------------- */}
      <section className="edit-card">
        <h2 className="edit-card-title">Links</h2>
        <div className="field">
          <label htmlFor="p-website">Website <span className="optional">optional</span></label>
          <input
            id="p-website" type="url" maxLength={500} value={draft.websiteUrl}
            onChange={(e) => set('websiteUrl', e.target.value)} placeholder="https://example.com"
          />
          {websiteProblem && <div className="hint hint-error">{websiteProblem}</div>}
        </div>

        {draft.links.map((link, i) => (
          <div key={i} className="link-row">
            <input
              type="text" maxLength={40} value={link.label} placeholder="Label"
              onChange={(e) => set('links', draft.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
            />
            <input
              type="url" maxLength={500} value={link.url} placeholder="https://…"
              onChange={(e) => set('links', draft.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
            />
            <button
              className="icon-btn" aria-label="Remove link"
              onClick={() => set('links', draft.links.filter((_, j) => j !== i))}
            >
              <IconTrash width={15} height={15} />
            </button>
            {linkProblems[i] && <div className="hint hint-error link-row-error">{linkProblems[i]}</div>}
          </div>
        ))}
        {draft.links.length < 8 && (
          <button
            className="btn small"
            onClick={() => set('links', [...draft.links, { provider: '', label: '', url: '' }])}
          >
            Add a link
          </button>
        )}
      </section>

      <div className="edit-actions">
        <button className="btn primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        <Link className="btn" to={`/u/${profile?.username ?? user.handle}`}>Cancel</Link>
      </div>
    </div>
  );
}
