import { useEffect, useState } from 'react';
import { useSettings, type Theme } from '@/stores/settings';
import { useAuth } from '@/stores/auth';
import { api } from '@/lib/api';
import { listModes } from '@/visualizer/engine';
import '@/visualizer/modes';
import { usePlayer } from '@/player/store';
import { IconSun, IconMoon, IconSettings as IconSys, IconWave } from '@/components/Icons';

/** Admin-only: edit the public support links without redeploying. */
function SupportConfigEditor() {
  const [form, setForm] = useState({ githubSponsorsUrl: '', sociabuzzUrl: '', qrisImageUrl: '', supporters: '' });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ githubSponsorsUrl: string | null; sociabuzzUrl: string | null; qrisImageUrl: string | null; supporters: string[] }>('/site/config')
      .then((c) => setForm({
        githubSponsorsUrl: c.githubSponsorsUrl ?? '',
        sociabuzzUrl: c.sociabuzzUrl ?? '',
        qrisImageUrl: c.qrisImageUrl ?? '',
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
      <div className="section-head"><h2 className="section-title">Support page (admin)</h2></div>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13.5, marginTop: 0, maxWidth: 560 }}>
        Public links shown on the Support page. Leave a field empty to hide that
        method. Supporter names are listed only with each person's permission —
        one name per line.
      </p>
      <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
        {([
          ['githubSponsorsUrl', 'GitHub Sponsors URL', 'https://github.com/sponsors/…'],
          ['sociabuzzUrl', 'Sociabuzz URL', 'https://sociabuzz.com/…'],
          ['qrisImageUrl', 'QRIS image URL', '/media/qris.png or https://…'],
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

      {user?.role === 'admin' && <SupportConfigEditor />}

      <div className="section-head"><h2 className="section-title">About</h2></div>
      <p className="prose" style={{ fontSize: 13.5 }}>
        ResonTune is free, open-source and community-driven. Basic listening never
        requires an account. Local music stays on your device. Media keys work via
        the Media Session API, and the app installs as a PWA.
      </p>
    </div>
  );
}
