/**
 * Support ResonTune - transparent, external, optional.
 *
 * ResonTune never collects payment information: every method here links to
 * an external service or shows an admin-configured QRIS image. Links come
 * from /api/site/config (admin-editable, env-fallback) - nothing is
 * hardcoded and nothing is invented.
 */
import { useFetch } from '@/lib/useFetch';
import { IconExternal, IconHeart } from '@/components/Icons';

interface SiteConfig {
  githubSponsorsUrl: string | null;
  sociabuzzUrl: string | null;
  qrisImageUrl: string | null;
  supporters: string[];
  repoUrl: string;
}

export default function Support() {
  const { data: cfg, loading } = useFetch<SiteConfig>('/site/config');

  if (loading) return <div className="loading-page"><span className="spin" /></div>;

  const anyMethod = Boolean(cfg?.githubSponsorsUrl || cfg?.sociabuzzUrl || cfg?.qrisImageUrl);

  return (
    <div className="page">
      <h1 className="page-title">Support ResonTune</h1>
      <p className="page-sub">
        ResonTune has no subscriptions and no ads. What it does have: hosting,
        audio storage, bandwidth, a CDN, a domain, moderation time, and
        ongoing open-source development. Community support carries those
        costs - every contribution goes to running and improving the
        platform. Supporting is entirely optional; everything on ResonTune
        stays free to listen to either way.
      </p>

      {!anyMethod && (
        <div className="empty">
          <h3>Support links aren't configured yet</h3>
          <p>
            This instance hasn't set up its support methods. If you run this
            server, configure them in the admin settings or via
            <code> GITHUB_SPONSORS_URL</code>, <code>SOCIABUZZ_URL</code> and
            <code> QRIS_IMAGE_URL</code>.
          </p>
        </div>
      )}

      <div className="about-grid three">
        {cfg?.githubSponsorsUrl && (
          <section className="about-card slim">
            <h3>GitHub Sponsors</h3>
            <p>
              Recurring or one-time support tied to the open-source project
              itself. Best if you already live on GitHub.
            </p>
            <a className="btn small primary" href={cfg.githubSponsorsUrl} target="_blank" rel="noreferrer">
              <IconHeart width={14} height={14} /> Sponsor <IconExternal width={11} height={11} />
            </a>
          </section>
        )}

        {cfg?.sociabuzzUrl && (
          <section className="about-card slim">
            <h3>Sociabuzz</h3>
            <p>
              One-time support with an optional public message - the way to go
              if you'd like your name associated with ResonTune. Public
              listing is entirely optional and never assumed.
            </p>
            <a className="btn small primary" href={cfg.sociabuzzUrl} target="_blank" rel="noreferrer">
              <IconHeart width={14} height={14} /> Support <IconExternal width={11} height={11} />
            </a>
          </section>
        )}

        {cfg?.qrisImageUrl && (
          <section className="about-card slim">
            <h3>QRIS</h3>
            <p>
              For supporters in Indonesia: scan with any QRIS-compatible
              banking or e-wallet app.
            </p>
            <img
              src={cfg.qrisImageUrl}
              alt="QRIS payment code for supporting ResonTune"
              className="qris-img"
              loading="lazy"
            />
          </section>
        )}
      </div>

      <div className="note-card" style={{ marginTop: 26, maxWidth: 640 }}>
        <strong>ResonTune never asks for payment details.</strong> All support
        happens on external services (or through your own banking app for
        QRIS). Never enter card or bank credentials into ResonTune itself -
        if something asks you to, it isn't us.
      </div>

      {cfg && cfg.supporters.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Supported by</h2>
            <span className="section-note">names listed with explicit permission - being here is opt-in</span>
          </div>
          <div className="supporter-wall">
            {cfg.supporters.map((name) => (
              <span key={name} className="pill" style={{ cursor: 'default' }}>{name}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
