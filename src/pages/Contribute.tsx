/**
 * Contribute — approachable paths for musicians, listeners, and developers.
 * Summaries + links; the repository docs remain the source of truth.
 */
import { Link } from 'react-router-dom';
import { useFetch } from '@/lib/useFetch';
import { IconSubmit, IconExternal } from '@/components/Icons';

interface SiteConfig { repoUrl: string }

export default function Contribute() {
  const { data: cfg } = useFetch<SiteConfig>('/site/config');
  const repo = cfg?.repoUrl ?? 'https://github.com/flessan/resontune';

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 6 }}>
        <h1 className="section-title" style={{ fontSize: 30 }}>Contribute</h1>
        <span className="section-note">musicians, listeners, designers, developers — there's a path for each</span>
      </div>

      <div className="about-grid">
        <section className="about-card">
          <h3>Release your music</h3>
          <p>
            Independent artists publish on ResonTune through the community
            program: you submit a track with its license and rights
            declaration, moderators review it, and approved music becomes a
            real catalog release with an artist page, artwork and radio
            support.
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
            Submission is a review process, not an upload button — it doesn't
            guarantee publication, and you must hold the rights to what you
            submit.
          </p>
          <Link to="/submit" className="btn small primary"><IconSubmit width={14} height={14} /> Submit music</Link>
        </section>

        <section className="about-card">
          <h3>Improve the catalog</h3>
          <p>
            Spotted wrong metadata, a broken link, a mislabeled genre, or a
            rights concern? Open an issue — catalog corrections and
            copyright/rights reports are handled through the project tracker
            so every change is visible and auditable.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn small" href={`${repo}/issues/new?labels=metadata`} target="_blank" rel="noreferrer">
              Report incorrect metadata <IconExternal width={12} height={12} />
            </a>
            <a className="btn small" href={`${repo}/issues/new?labels=rights`} target="_blank" rel="noreferrer">
              Report a rights issue <IconExternal width={12} height={12} />
            </a>
          </div>
        </section>

        <section className="about-card">
          <h3>Words & design</h3>
          <p>
            Documentation edits, clearer UI copy, translations, accessibility
            reviews, and design/UX proposals are all welcome — none of them
            require writing application code. Open an issue describing what
            you'd improve, or send a pull request directly for docs.
          </p>
          <a className="btn small" href={`${repo}/issues`} target="_blank" rel="noreferrer">
            Open an issue <IconExternal width={12} height={12} />
          </a>
        </section>

        <section className="about-card">
          <h3>Report bugs</h3>
          <p>
            Include what you did, what you expected, and what happened
            instead. For security vulnerabilities, please follow the private
            disclosure process in SECURITY.md rather than a public issue.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn small" href={`${repo}/issues/new?labels=bug`} target="_blank" rel="noreferrer">
              File a bug <IconExternal width={12} height={12} />
            </a>
            <a className="btn small" href={`${repo}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
              Security policy <IconExternal width={12} height={12} />
            </a>
          </div>
        </section>
      </div>

      <div className="section-head"><h2 className="section-title">Contribute code</h2></div>
      <div className="about-grid">
        <section className="about-card">
          <h3>The workflow</h3>
          <ol className="about-steps">
            <li>Fork the repository</li>
            <li>Create a branch for your change</li>
            <li>Make the change (with docs where relevant)</li>
            <li>Run the checks — <code>npm run typecheck</code> and <code>npm run build</code></li>
            <li>Open a pull request describing the why, not just the what</li>
          </ol>
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
            Development setup is two commands: <code>npm install</code>, then
            <code> npm run dev:server</code> + <code>npm run dev</code>. The
            embedded database seeds itself — no external services needed.
          </p>
        </section>

        <section className="about-card">
          <h3>Start here</h3>
          <ul className="about-links">
            <li><a href={repo} target="_blank" rel="noreferrer">GitHub repository <IconExternal width={11} height={11} /></a></li>
            <li><a href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer">README — what &amp; why <IconExternal width={11} height={11} /></a></li>
            <li><a href={`${repo}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">CONTRIBUTING.md — conventions <IconExternal width={11} height={11} /></a></li>
            <li><a href={`${repo}/tree/main/docs`} target="_blank" rel="noreferrer">docs/ — architecture, database, providers, visualizers, moderation, deployment <IconExternal width={11} height={11} /></a></li>
            <li><a href={`${repo}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">SECURITY.md — responsible disclosure <IconExternal width={11} height={11} /></a></li>
          </ul>
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>
            Good first contributions: a new visualizer mode
            (docs/visualizers.md walks through it), an empty-state
            improvement, or a provider adapter that uses an official API.
          </p>
        </section>
      </div>
    </div>
  );
}
