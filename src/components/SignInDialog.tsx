import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { IconClose } from './Icons';
import { useScrollLock } from '@/lib/scrollLock';

/**
 * Sign in / create account — backed by Neon Auth (the single authentication
 * authority). Additional identity providers (e.g. GitHub) are configured
 * inside Neon Auth, not implemented here.
 */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const available = useAuth((s) => s.available);
  useScrollLock(true);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'up') {
        await useAuth.getState().signUp(name.trim() || email.split('@')[0], email.trim(), password);
        toast('Welcome to ResonTune!');
      } else {
        await useAuth.getState().signIn(email.trim(), password);
        toast('Signed in.');
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Sign in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3>{mode === 'up' ? 'Create your account' : 'Sign in to ResonTune'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <p className="dialog-sub">
          You never need an account to listen. Signing in adds synced playlists,
          favorites and history.
        </p>

        {!available ? (
          <p className="hint" style={{ marginTop: 4 }}>
            Sign-in isn’t configured on this deployment. Browsing, playback and
            local music all work without an account.
          </p>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            {mode === 'up' && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="auth-name">Name</label>
                <input
                  id="auth-name" type="text" value={name} maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How you’ll appear on ResonTune" autoComplete="name"
                />
              </div>
            )}
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email"
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password" type="password" value={password} required minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'up' ? 'At least 8 characters' : 'Your password'}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              />
            </div>
            <button className="btn primary" style={{ width: '100%' }} type="submit" disabled={busy || !email.trim() || password.length < 8}>
              {busy ? 'One moment…' : mode === 'up' ? 'Create account' : 'Sign in'}
            </button>
            <p style={{ fontSize: 12.5, color: 'var(--on-surface-muted)', textAlign: 'center', margin: '12px 0 0' }}>
              {mode === 'up' ? (
                <>Already have an account?{' '}
                  <button type="button" className="link-btn" onClick={() => { setMode('in'); setError(null); }}>Sign in</button>
                </>
              ) : (
                <>New here?{' '}
                  <button type="button" className="link-btn" onClick={() => { setMode('up'); setError(null); }}>Create an account</button>
                </>
              )}
            </p>
          </form>
        )}

        {/* Stated, not pre-ticked: no consent checkbox, no bundled opt-in. */}
        <p className="dialog-legal">
          Accounts are covered by our <Link to="/terms" onClick={onClose}>terms of use</Link>{' '}
          and <Link to="/privacy" onClick={onClose}>privacy page</Link>, which lists
          everything an account stores.
        </p>
      </div>
    </div>
  );
}
