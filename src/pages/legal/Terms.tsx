/**
 * /terms — the rules for using ResonTune, in the same plain register as the
 * rest of the product. Scope is deliberately narrow: this is a free,
 * open-source music platform with no payments and no premium tier.
 */
import { Link } from 'react-router-dom';
import { LegalPage, LegalSection, REPO_URL } from './LegalPage';

export default function Terms() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <>
          ResonTune is a free, open-source music platform. There is nothing to
          buy, no subscription and no trial. These terms describe what you can
          expect from the service and what it expects from you.
        </>
      }
    >
      <LegalSection id="service" title="What the service is">
        <p className="prose">
          ResonTune publishes a hand-curated catalog of music metadata and links
          to recordings hosted elsewhere, together with a player, playlists and
          member profiles. Listening does not require an account; an account
          adds sync for the things you create. The software is MIT-licensed and{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">public</a>; the
          music is not — see{' '}
          <Link to="/copyright">music rights &amp; copyright</Link>.
        </p>
      </LegalSection>

      <LegalSection id="account" title="Your account">
        <ul className="legal-list">
          <li>
            Sign-in is handled by Neon Auth. Keep your credentials to yourself;
            activity from your account is treated as yours.
          </li>
          <li>
            One person, one account. Do not impersonate another person, artist,
            label or ResonTune itself, and do not pick a username that
            deliberately suggests you are someone you are not.
          </li>
          <li>
            You can delete your account at any time from{' '}
            <Link to="/settings">Settings</Link>. No retention flow, no
            “are you sure you want to lose your benefits” maze.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="conduct" title="Acceptable use">
        <p className="prose">Do not use ResonTune to:</p>
        <ul className="legal-list">
          <li>
            publish, request or link to music you do not have the right to
            distribute, or misrepresent who holds the rights to a recording;
          </li>
          <li>
            harass, threaten or abuse other people, including through profile
            text, playlist titles or descriptions;
          </li>
          <li>
            post malware, phishing links, spam, or links that pretend to be
            something they are not;
          </li>
          <li>
            scrape, mirror or bulk-download the catalog or the media it points
            at, or bypass rate limits, moderation or takedowns;
          </li>
          <li>
            probe, overload or interfere with the service or the hosts that
            serve the music;
          </li>
          <li>
            use automated systems to inflate play counts, likes or any other
            public number.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="ugc" title="What you write and create">
        <p className="prose">
          Your profile text, playlist titles and descriptions are yours. By
          making a playlist public you are choosing to publish it, along with
          your username and display name; anyone can see it and copy it. Keep
          anything you would not want public out of those fields — the profile
          editor is not private storage.
        </p>
        <p className="prose">
          You keep whatever rights you have in what you write. You give
          ResonTune permission to store and display it in the product so the
          feature can work. Content that breaks these terms can be edited or
          removed.
        </p>
      </LegalSection>

      <LegalSection id="music" title="Music and rights holders">
        <p className="prose">
          ResonTune does not own the catalog. Recordings are published by
          artists, labels and archives under their own licenses, and playback
          usually streams directly from the host they chose. Availability,
          license terms and territory come from the rights holder, not from
          ResonTune, and a track can disappear the moment they change their
          mind. What you may do with a recording is set by its license, which is
          shown on every track page —{' '}
          <Link to="/copyright">details here</Link>.
        </p>
      </LegalSection>

      <LegalSection id="links" title="External links and media">
        <p className="prose">
          Artist links, media hosts and support pages lead to sites ResonTune
          does not control and is not responsible for. Following them means
          accepting their terms and their privacy practices.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="Availability">
        <p className="prose">
          This is a community project. It can be slow, it can be down, features
          can change, and the catalog can shrink as well as grow. It is provided
          as-is, without warranties of any kind, and without a guaranteed level
          of service. To the maximum extent the law allows, the maintainers and
          the operator are not liable for indirect or consequential loss arising
          from use of the service. Nothing here removes rights you have as a
          consumer that cannot be waived.
        </p>
      </LegalSection>

      <LegalSection id="enforcement" title="Suspension and removal">
        <p className="prose">
          Accounts and content that break these terms may be suspended or
          removed, and content subject to a valid rights complaint will be taken
          down. Where it is reasonable, you will be told why. Repeated or
          deliberate infringement ends in account removal.
        </p>
      </LegalSection>

      <LegalSection id="money" title="No payments">
        <p className="prose">
          ResonTune does not sell anything, does not have a premium tier, does
          not run trials and does not process payments. There is no checkout, no
          billing and no stored payment method — the application contains no
          payment code at all. Donation links on the Support page, when the
          operator sets them, are ordinary external links to third-party
          platforms; giving is always optional and no feature depends on it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes and contact">
        <p className="prose">
          These terms change as the product does; the date at the top is when
          they were last reviewed, and the full history is public in the
          repository. Continuing to use ResonTune after a change means the new
          version applies. Questions, complaints or takedown requests: see{' '}
          <Link to="/copyright">music rights &amp; copyright</Link> for the
          reporting route, or open an issue on{' '}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">GitHub</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
