/**
 * Release Music - link-only intake.
 *
 * ResonTune doesn't collect submissions in a database. Creators reach the
 * team through the community channels; review and rights conversations
 * happen there, and approved music is published into the real catalog by
 * catalog administrators. No upload state, no submission records.
 */
import { useFetch } from '@/lib/useFetch';
import { IconExternal, IconMic } from '@/components/Icons';

interface SiteConfig {
  repoUrl: string;
  discordUrl: string | null;
  telegramUrl: string | null;
  whatsappUrl: string | null;
}

export default function Submit() {
  const { data: cfg } = useFetch<SiteConfig>('/site/config');

  const channels = [
    { label: 'Discord', url: cfg?.discordUrl, desc: 'Fastest replies - share your music in the releases channel.' },
    { label: 'Telegram', url: cfg?.telegramUrl, desc: 'Message the ResonTune community group.' },
    { label: 'WhatsApp', url: cfg?.whatsappUrl, desc: 'Reach the team directly.' },
  ].filter((c): c is { label: string; url: string; desc: string } => Boolean(c.url));

  return (
    <div className="page">
      <div className="release-hero">
        <IconMic width={28} height={28} aria-hidden />
        <h1 className="page-title" style={{ margin: '10px 0 6px' }}>Release music on ResonTune</h1>
        <p className="page-sub" style={{ margin: '0 auto' }}>
          Join the community and contact us - we'll listen, talk rights and
          licensing with you, and publish approved music into the catalog.
        </p>
      </div>

      {channels.length > 0 ? (
        <div className="channel-grid">
          {channels.map((c) => (
            <a key={c.label} className="channel-card" href={c.url} target="_blank" rel="noreferrer">
              <span className="channel-name">{c.label} <IconExternal width={13} height={13} /></span>
              <span className="channel-desc">{c.desc}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 8 }}>
          <h3>Community channels are being set up</h3>
          <p>
            In the meantime, open an issue on{' '}
            <a href={cfg?.repoUrl ?? 'https://github.com/flessan/resontune'} target="_blank" rel="noreferrer">GitHub</a>{' '}
            to get in touch about releasing your music.
          </p>
        </div>
      )}

      <div className="about-card" style={{ marginTop: 28, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
        <h3>What to have ready</h3>
        <p style={{ marginBottom: 8 }}>
          You must hold the rights to the music you want to release. Bring:
        </p>
        <ul className="plain-list">
          <li>Your artist name and a link to the music (any listenable form).</li>
          <li>The license you want to publish under (CC0, CC BY, all-rights-reserved streaming, …).</li>
          <li>Who holds the rights, and whether ResonTune may stream and/or redistribute it.</li>
        </ul>
        <p style={{ fontSize: 12.5, color: 'var(--on-surface-faint)', marginTop: 10, marginBottom: 0 }}>
          Reaching out isn't an upload button - publication happens after a
          human conversation and a rights check, and the published catalog
          records the license and permissions you declare.
        </p>
      </div>
    </div>
  );
}
