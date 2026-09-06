import { useState } from 'react';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { IconClose, IconGitHub } from './Icons';

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const providers = useAuth((s) => s.providers);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const devLogin = async () => {
    if (!handle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await useAuth.getState().devLogin(handle.trim());
      toast(`Welcome, ${handle.trim()}!`);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Sign in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3>Sign in to ResonTune</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <p className="dialog-sub">
          You never need an account to listen. Signing in adds synced playlists,
          favorites, history and music submissions.
        </p>
        {error && <div className="form-error">{error}</div>}

        {providers.github && (
          <a className="btn" href="/api/auth/github" style={{ width: '100%', marginBottom: 12 }}>
            <IconGitHub width={16} height={16} /> Continue with GitHub
          </a>
        )}

        {providers.dev && (
          <>
            {providers.github && (
              <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', margin: '8px 0' }}>or</p>
            )}
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="dev-handle">Local handle {providers.github ? '(dev only)' : ''}</label>
              <input
                id="dev-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void devLogin()}
                placeholder="e.g. nightowl"
                maxLength={24}
                autoComplete="username"
              />
              <p className="hint">
                Local development sign-in — pick any handle. The first account on a
                fresh database becomes admin so you can try moderation.
              </p>
            </div>
            <button className="btn primary" style={{ width: '100%' }} onClick={() => void devLogin()} disabled={busy || !handle.trim()}>
              {busy ? 'Signing in…' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
