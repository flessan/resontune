import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSettings, type Theme } from '@/stores/settings';
import { useAuth } from '@/stores/auth';
import { api } from '@/lib/api';
import { clearAccountScopedCaches, deleteIdentity, type IdentityDeletion } from '@/lib/authClient';
import { dialogs } from '@/stores/dialogs';
import { toast } from '@/stores/toast';
import { listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { usePlayer } from '@/player/store';
import { IconSun, IconMoon, IconSettings as IconSys, IconWave } from '@/components/Icons';

/** Admin-only: edit the public support links without redeploying. */
function SupportConfigEditor() {
  const [form, setForm] = useState({ githubSponsorsUrl: '', sociabuzzUrl: '', qrisImageUrl: '', discordUrl: '', telegramUrl: '', whatsappUrl: '', supporters: '' });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ githubSponsorsUrl: string | null; sociabuzzUrl: string | null; qrisImageUrl: string | null; discordUrl: string | null; telegramUrl: string | null; whatsappUrl: string | null; supporters: string[] }>('/site/config')
      .then((c) => setForm({
        githubSponsorsUrl: c.githubSponsorsUrl ?? '',
        sociabuzzUrl: c.sociabuzzUrl ?? '',
        qrisImageUrl: c.qrisImageUrl ?? '',
        discordUrl: c.discordUrl ?? '',
        telegramUrl: c.telegramUrl ?? '',
        whatsappUrl: c.whatsappUrl ?? '',
        supporters: c.supporters.join('\n'),
      }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setStatus('saving');
    setError('');
    try {
      await api.put('/site/config/support', {
        githubSponsorsUrl: form.githubSponsorsUrl.trim() || null,
        sociabuzzUrl: form.sociabuzzUrl.trim() || null,
        qrisImageUrl: form.qrisImageUrl.trim() || null,
        discordUrl: form.discordUrl.trim() || null,
        telegramUrl: form.telegramUrl.trim() || null,
        whatsappUrl: form.whatsappUrl.trim() || null,
        supporters: form.supporters.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <>
      <div className="section-head"><h2 className="section-title">Site links (admin)</h2></div>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginTop: 0, maxWidth: 560 }}>
        Public links shown on the Support and Release-music pages. Leave a field
        empty to hide that method. Supporter names are listed only with each
        person's permission — one name per line.
      </p>
      <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
        {([
          ['githubSponsorsUrl', 'GitHub Sponsors URL', 'https://github.com/sponsors/…'],
          ['sociabuzzUrl', 'Sociabuzz URL', 'https://sociabuzz.com/…'],
          ['qrisImageUrl', 'QRIS image URL', '/media/qris.png or https://…'],
          ['discordUrl', 'Community Discord URL', 'https://discord.gg/…'],
          ['telegramUrl', 'Community Telegram URL', 'https://t.me/…'],
          ['whatsappUrl', 'Community WhatsApp URL', 'https://chat.whatsapp.com/…'],
        ] as const).map(([key, label, placeholder]) => (
          <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--ink-muted)' }}>
            {label}
            <input
              className="input"
              type="url"
              value={form[key]}
              placeholder={placeholder}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--ink-muted)' }}>
          Supporters (one name per line, opt-in only)
          <textarea
            className="input"
            rows={4}
            value={form.supporters}
            onChange={(e) => setForm((f) => ({ ...f, supporters: e.target.value }))}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn small primary" onClick={() => void save()} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save support settings'}
          </button>
          {status === 'saved' && <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Saved.</span>}
          {status === 'error' && <span style={{ fontSize: 12.5, color: 'var(--danger, #b3423f)' }}>{error}</span>}
        </div>
      </div>
    </>
  );
}


/**
 * Your data — the whole privacy control surface, deliberately four plain
 * actions rather than a dashboard of toggles. Every one of them is a real
 * server-side operation scoped to the signed-in account.
 */
/** Plain-language result of the Neon Auth half of an account deletion. */
/**
 * What the server said about the identity half of the deletion. Two things
 * can delete a Neon Auth identity, and which one ran changes what the user
 * must do next, so the shape is kept explicit rather than assumed.
 */
interface ServerDeletion {
  identity?: {
    status?: string;
    deletedByServer?: boolean;
    clientShouldAttempt?: boolean;
    reason?: string;
  };
}

function identityOutcome(identity: IdentityDeletion): string {
  const base = 'Everything ResonTune stored about your account has been deleted, and you are signed out. ';
  switch (identity.status) {
    case 'deleted':
      return base + 'Your Neon Auth sign-in identity was deleted as well, so your email address is no longer held by the sign-in provider.';
    case 'verification-sent':
      return base
        + 'Neon Auth sent a confirmation email for deleting your sign-in identity: until you open that '
        + 'link, the identity — including your email address — still exists at Neon Auth.';
    case 'unsupported':
      return base
        + 'Your Neon Auth sign-in identity has NOT been deleted: this deployment does not offer '
        + 'self-service identity deletion. Your email address and sign-in still exist at Neon Auth, '
        + 'where you can delete them directly. Signing in again here would create a new, empty ResonTune account.';
    case 'failed': {
      // The reason often arrives as its own sentence; don't end up with "..).".
      const why = identity.message.trim().replace(/[.\s]+$/, '');
      return base
        + `Your Neon Auth sign-in identity has NOT been deleted (${why}). It still exists at `
        + 'Neon Auth, where you can delete it directly. Signing in again here would create a new, '
        + 'empty ResonTune account.';
    }
    default:
      return base
        + 'This deployment has no sign-in provider configured, so there was no separate identity to delete.';
  }
}

function AccountDataSection() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'export' | 'history' | 'delete' | null>(null);

  const exportData = async () => {
    setBusy('export');
    try {
      const data = await api.get<Record<string, unknown>>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'resontune-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Your data has been downloaded.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setBusy(null);
    }
  };

  const clearHistory = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear your listening history?',
      body: 'Removes every play recorded on your account. Playlists, favorites and public play counts are not affected.',
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!ok) return;
    setBusy('history');
    try {
      await api.del('/me/history');
      toast('Listening history cleared.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not clear your history.');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Two separate things carry the word "account", and conflating them would
   * be a lie: the ResonTune rows (this API owns them, they always go) and
   * the Neon Auth sign-in identity (Neon Auth owns it; deleting it is a
   * self-service request from this browser, and some deployments do not
   * allow it at all). The confirmation says so before anything happens, and
   * the closing dialog reports what actually happened.
   */
  const deleteAccount = async () => {
    const user = useAuth.getState().user;
    if (!user) return;
    const ok = await dialogs.confirm({
      title: 'Delete your ResonTune account?',
      body:
        'ResonTune deletes your profile, playlists, favorites, likes, listening history and profile '
        + 'links. It cannot be undone. Catalog pages you are credited on stay published with the link '
        + 'to your account removed. ResonTune then asks Neon Auth — which holds your sign-in and your '
        + 'email address — to delete that identity too; if this deployment does not allow self-service '
        + 'identity deletion, you will be told and can remove it in Neon Auth yourself.',
      confirmLabel: 'Continue',
      danger: true,
    });
    if (!ok) return;
    const typed = await dialogs.prompt({
      title: 'Confirm deletion',
      label: `Type your username (${user.handle}) to confirm`,
      placeholder: user.handle,
      confirmLabel: 'Delete my account',
    });
    if (!typed) return;
    setBusy('delete');
    let identity: IdentityDeletion = { status: 'not-configured' };
    try {
      const result = await api.del<ServerDeletion>('/me', { confirm: typed });
      // The server deletes the identity itself when this deployment holds a
      // Neon administrative credential. When it does, asking the provider a
      // second time from here would fail against an identity that is already
      // gone and turn a clean deletion into a scary message.
      const server = result?.identity;
      if (server?.deletedByServer) {
        identity = { status: 'deleted' };
      } else {
        identity = await deleteIdentity();
        // The browser could not do it either. When the server actually
        // reached the provider and was refused, its account of why is the
        // useful one — the browser's own error is usually a bare "Not found".
        const serverTried = server?.status === 'unauthorized' || server?.status === 'failed';
        if (identity.status !== 'deleted' && identity.status !== 'verification-sent' && serverTried) {
          identity = { status: 'failed', message: server?.reason ?? 'the provider refused' };
        }
      }
      // Signing out can fail precisely because the identity just went away;
      // that must not turn a successful deletion into an error message.
      try {
        await useAuth.getState().logout();
      } catch {
        useAuth.setState({ user: null, favoriteIds: new Set() });
      }
      await clearAccountScopedCaches();
      await useAuth.getState().refresh();
      navigate('/');
      void dialogs.alert({
        title: 'Your ResonTune account is deleted',
        body: identityOutcome(identity),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete your account.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="section-head"><h2 className="section-title">Your data</h2></div>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginTop: 0, maxWidth: 560 }}>
        What ResonTune stores about your account, and what you can do about it.
        The <Link to="/privacy">privacy page</Link> lists every field.
      </p>
      <div className="data-actions">
        <div className="data-action">
          <div>
            <strong>Download your data</strong>
            <p>Profile, playlists and their tracks, favorites, likes and listening history, as JSON.</p>
          </div>
          <button className="btn small" onClick={() => void exportData()} disabled={busy !== null}>
            {busy === 'export' ? 'Preparing…' : 'Export'}
          </button>
        </div>
        <div className="data-action">
          <div>
            <strong>Edit your profile</strong>
            <p>Correct your display name, username, bio, location and links.</p>
          </div>
          <Link className="btn small" to="/profile/edit">Edit profile</Link>
        </div>
        <div className="data-action">
          <div>
            <strong>Clear listening history</strong>
            <p>Erases the plays recorded on your account. Anonymous play counts are not affected.</p>
          </div>
          <button className="btn small" onClick={() => void clearHistory()} disabled={busy !== null}>
            {busy === 'history' ? 'Clearing…' : 'Clear history'}
          </button>
        </div>
        <div className="data-action">
          <div>
            <strong>Delete your account</strong>
            <p>
              Erases everything ResonTune stores about you — profile, playlists, favorites,
              likes and history. ResonTune then asks Neon Auth to delete your sign-in
              identity, and tells you whether that succeeded. This cannot be undone.
            </p>
          </div>
          <button className="btn small danger" onClick={() => void deleteAccount()} disabled={busy !== null}>
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function Settings() {
  const user = useAuth((s) => s.user);
  const theme = useSettings((s) => s.theme);
  const visualizerMode = useSettings((s) => s.visualizerMode);
  const vis = useSettings((s) => s.visualizer);
  const { setTheme, setVisualizerMode, updateVisualizer } = useSettings.getState();
  const modes = listModes();

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Appearance, player and visualizer preferences. Stored locally in this browser.</p>

      <div className="section-head"><h2 className="section-title">Appearance</h2></div>
      <div className="pill-row" role="radiogroup" aria-label="Theme">
        {([
          ['light', 'Light', <IconSun key="l" width={14} height={14} />],
          ['dark', 'Dark', <IconMoon key="d" width={14} height={14} />],
          ['system', 'System', <IconSys key="s" width={14} height={14} />],
        ] as [Theme, string, React.ReactNode][]).map(([value, label, icon]) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            className={`pill ${theme === value ? 'active' : ''}`}
            onClick={() => setTheme(value)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="section-head"><h2 className="section-title">Visualizer</h2></div>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginTop: 0 }}>
        Default mode for the immersive player. You can also change it live while it's open.
      </p>
      <div className="pill-row" role="radiogroup" aria-label="Visualizer mode" style={{ marginBottom: 22 }}>
        {modes.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={visualizerMode === m.id}
            className={`pill ${visualizerMode === m.id ? 'active' : ''}`}
            onClick={() => setVisualizerMode(m.id)}
            title={m.description}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 420 }}>
        {([
          ['sensitivity', 'Sensitivity', 0.4, 2],
          ['intensity', 'Intensity', 0.4, 2],
          ['speed', 'Speed', 0.3, 2],
          ['opacity', 'Opacity', 0.2, 1],
          ['smoothing', 'Smoothing', 0, 0.95],
          ['scale', 'Scale', 0.5, 1.6],
        ] as const).map(([key, label, min, max]) => (
          <div key={key} className="field" style={{ marginBottom: 12 }}>
            <label htmlFor={`set-${key}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
              {label} <span style={{ color: 'var(--ink-faint)' }}>{vis[key].toFixed(2)}</span>
            </label>
            <input
              id={`set-${key}`}
              type="range"
              min={min}
              max={max}
              step={0.01}
              value={vis[key]}
              onChange={(e) => updateVisualizer({ [key]: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() => usePlayer.getState().setView('immersive')}
        disabled={usePlayer.getState().index === -1}
      >
        <IconWave width={15} height={15} /> Preview in immersive player
      </button>

      <div className="section-head"><h2 className="section-title">Keyboard shortcuts</h2></div>
      <table className="simple" style={{ maxWidth: 420 }}>
        <tbody>
          <tr><td><span className="kbd">Space</span></td><td>Play / pause</td></tr>
          <tr><td><span className="kbd">/</span></td><td>Focus search</td></tr>
          <tr><td><span className="kbd">Shift</span> + <span className="kbd">→</span></td><td>Next track</td></tr>
          <tr><td><span className="kbd">Shift</span> + <span className="kbd">←</span></td><td>Previous track</td></tr>
          <tr><td><span className="kbd">←</span> / <span className="kbd">→</span> on seek bar</td><td>Seek ±5s</td></tr>
          <tr><td><span className="kbd">Esc</span></td><td>Close expanded / immersive player</td></tr>
        </tbody>
      </table>

      {user && <AccountDataSection />}

      {user?.role === 'admin' && <SupportConfigEditor />}

      <div className="section-head"><h2 className="section-title">About</h2></div>
      <p className="prose" style={{ fontSize: 13.5 }}>
        ResonTune is free, open-source and community-driven. Basic listening never
        requires an account. Local music stays on your device. Media keys work via
        the Media Session API, and the app installs as a PWA.
      </p>
      <p className="prose" style={{ fontSize: 13.5 }}>
        <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms of use</Link> ·{' '}
        <Link to="/copyright">Music rights &amp; copyright</Link>
      </p>
    </div>
  );
}
