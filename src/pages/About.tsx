/**
 * About — what ResonTune is, how music works here, and how to take part.
 * Native M3 destination: page title, tonal sections, list items.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { OriginalBadge, SourceChip } from '@/components/Provenance';

interface SiteConfig { repoUrl: string }

export default function About() {
  const { data: cfg } = useFetch<SiteConfig>('/site/config');
  const repo = cfg?.repoUrl ?? 'https://github.com/flessan/resontune';

  return (
    <div className="page">
      <h1 className="page-title">About ResonTune</h1>
      <p className="page-sub">
        An open, community-driven music platform built to make listening and
        discovering music accessible without unnecessary subscription
        barriers. No account is needed to listen. No algorithm decides what
        you hear.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
        <Link to="/" className="btn primary">Start listening</Link>
        <Link to="/support" className="btn">Support ResonTune</Link>
      </div>

      <div className="about-grid">
        <section className="about-card">
          <h3>Why it exists</h3>
          <p>
            Streaming became a set of walled gardens: subscriptions, lock-in,
            opaque recommendation feeds. ResonTune is the opposite bet — a
            catalog you can browse openly, play instantly, and inspect down to
            the license line of every track. The code is open source, the
            catalog rules are documented, and the platform runs on the same
            honesty it asks from its artists.
          </p>
        </section>

        <section className="about-card">
          <h3>How music works here</h3>
          <p>
            Every playable track has an inspectable origin and an explicit
            rights record. When you press play, the server — not the browser —
            decides how a track may be played, which is how takedowns and
            streaming permissions actually hold. Nothing on ResonTune fakes a
            source it doesn't have.
          </p>
        </section>
      </div>

      <div className="section-head"><h2 className="section-title">Two worlds of music</h2></div>
      <div className="about-grid">
        <section className="about-card">
          <div style={{ marginBottom: 10 }}><OriginalBadge /></div>
          <h3>ResonTune Originals</h3>
          <p>
            Our own catalog: artists who release directly through ResonTune.
            The platform hosts the audio and holds the rights it claims, every
            release carries a catalog number, and everything is free to
            stream. Originals are the platform's musical identity — not a
            marketing label.
          </p>
          <Link to="/originals" className="btn small">Browse Originals</Link>
        </section>

        <section className="about-card">
          <div style={{ marginBottom: 10 }}><SourceChip sourceType="community" /></div>
          <h3>Community</h3>
          <p>
            Independent creators release music through the community: a human
            conversation, a rights check, then publication. The artist declares
            the license and permissions; ResonTune records them verbatim and
            never invents rights. Community releases get the same artwork,
            artist pages, radio and playlist treatment as Originals — the
            distinction is provenance, not quality.
          </p>
          <Link to="/community" className="btn small">Browse Community</Link>
        </section>

        <section className="about-card">
          <div style={{ marginBottom: 10 }}><SourceChip origin="local" /></div>
          <h3>Local music</h3>
          <p>
            Drop your own audio files into the browser. They're parsed, stored
            in your browser's own database, and <strong>never uploaded</strong>.
            Local files are a private world that happens to share a very good
            player.
          </p>
          <Link to="/library" className="btn small">Open local library</Link>
        </section>

        <section className="about-card">
          <div style={{ marginBottom: 10 }}><SourceChip sourceType="external" /></div>
          <h3>External sources</h3>
          <p>
            Provider adapters may reference music that lives elsewhere — but
            only through official, permitted mechanisms. When direct playback
            isn't allowed, ResonTune says so and links out honestly. External
            providers are an optional edge, never the foundation.
          </p>
        </section>
      </div>

      <div className="section-head"><h2 className="section-title">Principles</h2></div>
      <div className="about-grid three">
        <section className="about-card slim" id="privacy">
          <h3>Privacy</h3>
          <p>
            Listening requires no account. Anonymous plays are counted without
            identity. Sign in only adds sync — favorites, playlists, history —
            and your local files never leave your device. There is no tracking
            pixel economy here.
          </p>
        </section>
        <section className="about-card slim" id="licensing">
          <h3>Licensing</h3>
          <p>
            Every track shows its license, rights holder, and attribution
            requirements. Public availability is never treated as permission
            to redistribute. Takedowns are honored, logged, and auditable.
          </p>
        </section>
        <section className="about-card slim">
          <h3>Open source</h3>
          <p>
            The whole platform — player, visualizer, catalog, moderation — is
            MIT-licensed and developed in the open
            on <a href={repo} target="_blank" rel="noreferrer">GitHub</a>.
          </p>
        </section>
      </div>

      <div className="section-head"><h2 className="section-title">Take part</h2></div>
      <div className="about-grid">
        <section className="about-card">
          <h3>Contribute</h3>
          <p>
            Release music, report metadata problems, improve documentation, fix
            bugs, design better flows. There's a path for musicians and
            non-musicians, developers and non-developers.
          </p>
          <Link to="/contribute" className="btn small">How to contribute</Link>
        </section>
        <section className="about-card">
          <h3>Support</h3>
          <p>
            ResonTune has no subscriptions and no ads, so infrastructure —
            hosting, storage, bandwidth — is carried by the community. If the
            platform is useful to you, you can help keep it running.
          </p>
          <Link to="/support" className="btn small">Support ResonTune</Link>
        </section>
      </div>
    </div>
  );
}
