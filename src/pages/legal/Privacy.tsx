/**
 * /privacy — what ResonTune actually stores, why, and what you can do
 * about it.
 *
 * Every claim here is checked against the implementation: the users table
 * and its columns (server/db/migrations), the routes that write them
 * (server/routes/me.ts, playlists.ts, play.ts), the browser storage the
 * client uses (src/stores, src/local/db.ts, public/sw.js) and the two
 * third-party services the server talks to (Neon, ImgBB).
 */
import { Link } from 'react-router-dom';
import { LegalPage, LegalSection, REPO_URL } from './LegalPage';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro={
        <>
          Listening to ResonTune never requires an account, and nothing you
          listen to anonymously is tied to you. An account exists only to sync
          the things you make — playlists, favorites, your profile. This page
          lists the data that actually exists in the database, field by field.
        </>
      }
    >
      <LegalSection id="short" title="The short version">
        <ul className="legal-list">
          <li>No account is needed to browse or play music.</li>
          <li>
            There is no advertising, no tracking pixel, no analytics service and
            no fingerprinting in this application.
          </li>
          <li>ResonTune sets no cookies of its own.</li>
          <li>
            Music you add from your own device stays in your browser. There is
            no upload endpoint for it.
          </li>
          <li>
            You can export everything your account holds, correct your profile,
            clear your listening history, and delete your account yourself from{' '}
            <Link to="/settings">Settings</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="anonymous" title="If you never sign in">
        <p className="prose">
          Browsing and playback work without an account. Plays are counted
          against the <em>track</em>, not against a person: the play-count table
          stores a track id and a timestamp and has no user column, no session
          id and no IP address. Your player state — the queue, position, volume,
          theme, visualizer settings — is stored in your own browser and is
          never sent to the server.
        </p>
        <p className="prose">
          Like any web server, the API applies per-IP rate limits to resist
          abuse. Those counters live in memory for a one-minute window and are
          not written to the database. Hosting providers keep their own request
          logs; that is outside this application's control and depends on who
          operates the deployment you are using.
        </p>
      </LegalSection>

      <LegalSection id="account" title="What an account stores">
        <p className="prose">
          These are the columns that exist. Nothing else about you is written by
          the application.
        </p>
        <div className="legal-table-wrap">
          <table className="simple legal-table">
            <thead>
              <tr><th>Data</th><th>Where it comes from</th><th>Why</th></tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Data">Account id, join date, last profile update</td>
                <td data-label="Where it comes from">Created on your first signed-in request</td>
                <td data-label="Why">Identifying your rows; showing “member since”</td>
              </tr>
              <tr>
                <td data-label="Data">Username (handle)</td>
                <td data-label="Where it comes from">Suggested at sign-up, editable by you</td>
                <td data-label="Why">Your profile URL and public credit on playlists</td>
              </tr>
              <tr>
                <td data-label="Data">Display name</td>
                <td data-label="Where it comes from">Taken from your Neon Auth profile at first sign-in, editable</td>
                <td data-label="Why">Shown on your profile and your public playlists</td>
              </tr>
              <tr>
                <td data-label="Data">Bio, location text, website URL, profile links</td>
                <td data-label="Where it comes from">Only what you type into the profile editor</td>
                <td data-label="Why">Your public profile page</td>
              </tr>
              <tr>
                <td data-label="Data">Avatar URL (and thumbnail URL, provider id)</td>
                <td data-label="Where it comes from">The image you upload, hosted by ImgBB — or the picture your sign-in provider supplied</td>
                <td data-label="Why">Showing your photo. No image bytes are stored in the database</td>
              </tr>
              <tr>
                <td data-label="Data">Role (listener / moderator / admin)</td>
                <td data-label="Where it comes from">Set by the operator, never by you or your browser</td>
                <td data-label="Why">Authorizing catalog and moderation tools</td>
              </tr>
              <tr>
                <td data-label="Data">Authentication provider and subject id</td>
                <td data-label="Where it comes from">The identifier Neon Auth issues for you</td>
                <td data-label="Why">Matching your sign-in to your ResonTune account. It is not shown to anyone and is not in your data export</td>
              </tr>
              <tr>
                <td data-label="Data">Playlists and their tracks</td>
                <td data-label="Where it comes from">Created by you</td>
                <td data-label="Why">The playlist feature. Public playlists are visible to everyone</td>
              </tr>
              <tr>
                <td data-label="Data">Favorites and playlist likes</td>
                <td data-label="Where it comes from">Created by you</td>
                <td data-label="Why">Your library, and public like counts</td>
              </tr>
              <tr>
                <td data-label="Data">Listening history (track id + time)</td>
                <td data-label="Where it comes from">Written when you play a track while signed in</td>
                <td data-label="Why">The History page and your “top genres”. You can clear it at any time</td>
              </tr>
              <tr>
                <td data-label="Data">Editorial and moderation attribution</td>
                <td data-label="Where it comes from">Only for accounts with a moderator/admin role, when they act</td>
                <td data-label="Why">An audit trail for catalog and takedown decisions</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="prose">
          <strong>Not collected:</strong> no email address is stored (the server
          sees the address in the sign-in token and may use it once to suggest a
          username, but never writes it), no password (Neon Auth holds
          credentials), no phone number, no payment data, no device
          fingerprint, no precise or inferred geolocation. The “location” field
          is free text you type, such as a city name.
        </p>
      </LegalSection>

      <LegalSection id="local" title="What stays in your browser">
        <p className="prose">
          A fair amount of ResonTune runs locally, and that data never reaches
          the server:
        </p>
        <ul className="legal-list">
          <li>
            <strong>IndexedDB (<code>resontune-local</code>)</strong> — music
            files you add from your device, their embedded artwork and tags,
            local playlists, and a snapshot of the queue and playback position
            so a reload resumes where you were.
          </li>
          <li>
            <strong>localStorage</strong> — <code>resontune-settings</code>{' '}
            (theme, visualizer preferences) and{' '}
            <code>rt-nav-collapsed</code> (whether the sidebar is collapsed).
          </li>
          <li>
            <strong>Cache Storage</strong> — the service worker keeps the app
            shell and recent catalog responses so the app opens offline. Audio
            is deliberately not cached there.
          </li>
          <li>
            <strong>Sign-in state</strong> — if you sign in, the Neon Auth
            client keeps your session in browser storage on this origin.
          </li>
        </ul>
        <p className="prose">
          Clearing site data in your browser removes all of it, including your
          local music library.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" title="Third parties">
        <ul className="legal-list">
          <li>
            <strong>Neon</strong> — the Postgres database. Everything in the
            account table above is stored there.
          </li>
          <li>
            <strong>Neon Auth</strong> — sign-in. It holds your email address,
            credentials and any connected identity provider, and issues the
            token this API verifies. ResonTune never receives your password.
          </li>
          <li>
            <strong>ImgBB</strong> — profile photo hosting, and only that. Your
            browser sends the image to the ResonTune server, the server uploads
            it to ImgBB with a server-side key, and only the resulting URL is
            stored. Catalog audio and artwork never go through ImgBB.
          </li>
          <li>
            <strong>The hosts of the music itself</strong> — ResonTune's catalog
            is metadata plus links to media hosted elsewhere by the artists,
            labels or archives that publish it. When you press play, your
            browser fetches the audio (and often the artwork) directly from that
            host, which therefore sees your IP address and user agent, exactly
            as if you had opened that link yourself.
          </li>
          <li>
            <strong>The hosting provider</strong> of the deployment you are
            using, which operates the servers and their logs.
          </li>
        </ul>
        <p className="prose">
          There is no analytics provider, no advertising network, no A/B
          testing service, no session recorder and no third-party font or script
          CDN: the fonts ship with the application. What each third party does
          with data it receives is governed by its own terms — this project
          makes no promises on their behalf.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long things are kept">
        <ul className="legal-list">
          <li>
            Account data, playlists, favorites and profile fields: until you
            change or delete them, or delete your account.
          </li>
          <li>
            Listening history: until you clear it or delete your account. There
            is no automatic expiry job in the code.
          </li>
          <li>
            Anonymous play counts: kept indefinitely. They contain no identity
            and cannot be traced back to you.
          </li>
          <li>
            Moderation and takedown records: kept as an audit trail. When an
            account is deleted, its reference in those records is cleared, and
            what remains is the decision itself.
          </li>
          <li>
            Database backups and point-in-time recovery are provided by Neon on
            the operator's plan. Deleted rows can survive in those snapshots for
            the provider's retention window.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="rights" title="Your data, your controls">
        <ul className="legal-list">
          <li>
            <strong>See it</strong> — <Link to="/settings">Settings → Your data</Link>{' '}
            downloads a JSON file with your profile, playlists and their
            tracks, favorites, liked playlists and listening history.
          </li>
          <li>
            <strong>Correct it</strong> — <Link to="/profile/edit">edit your profile</Link>.
            Fields the system owns (your id, role and join date) are not
            editable, by you or by the browser.
          </li>
          <li>
            <strong>Clear your history</strong> — one button in Settings.
          </li>
          <li>
            <strong>Delete your account</strong> — in Settings. It removes your
            profile, playlists, favorites, likes, history and profile links.
            Catalog pages an account is credited on are shared records and are
            kept, with the link to the account removed. Your sign-in identity
            lives with Neon Auth and should also be deleted there.
          </li>
        </ul>
        <p className="prose">
          Depending on where you live you may have further rights — access,
          rectification, erasure, restriction, objection, portability, or
          complaint to a supervisory authority. Those rights, the lawful basis
          for processing and any international transfer requirements depend on
          the jurisdiction of the specific deployment and its operator, and are
          a matter for that operator and their legal counsel. This project does
          not claim certification or compliance with any particular regime.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p className="prose">
          Authorization is enforced on the server for every write: the account
          is taken from a cryptographically verified token, never from the
          request body, so no request can edit another account. Secrets stay in
          the server environment — the image-host key is never sent to the
          browser. Details and the reporting process are in the{' '}
          <a href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
            security policy
          </a>
          , and the incident process is documented in{' '}
          <a href={`${REPO_URL}/blob/main/docs/incident-response.md`} target="_blank" rel="noreferrer">
            docs/incident-response.md
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="children" title="Young listeners">
        <p className="prose">
          ResonTune is not directed at children and does not knowingly create
          accounts for them. Age thresholds differ by country; if an account
          should not exist, contact the operator and it will be removed.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes and contact">
        <p className="prose">
          This page changes with the code. Because the whole application is
          public, every change to it is visible in the repository's history —
          the “last updated” date above is when the text was last checked
          against the implementation. Material changes will be noted here.
        </p>
        <p className="prose">
          Questions about your data, or a request the buttons in Settings do not
          cover: open an issue on{' '}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">GitHub</a>{' '}
          (do not include personal details in a public issue) or contact the
          maintainers listed on the repository profile. Suspected security or
          privacy incidents should use private vulnerability reporting instead.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
