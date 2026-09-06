/**
 * /copyright — how music gets into the catalog, what the rights fields on
 * every track mean, and how to ask for something to be taken down.
 *
 * The fields named here are the real ones: licenses, rights_holder,
 * attribution_text, credits, streaming_permission, distribution_permission,
 * territory, rights_notes, source_type and the takedowns table.
 */
import { Link } from 'react-router-dom';
import { LegalPage, LegalSection, REPO_URL } from './LegalPage';

export default function Copyright() {
  return (
    <LegalPage
      title="Music rights & copyright"
      intro={
        <>
          ResonTune does not own the music it lists. Every recording belongs to
          the people who made it, and everything the catalog says about those
          rights is stored as data you can read on the track page.
        </>
      }
    >
      <LegalSection id="model" title="How music gets here">
        <p className="prose">
          There is no upload pipeline and no crawler. An administrator enters a
          release by hand: the artist, the release, the tracks, and a direct
          link to a recording that is already hosted publicly by the artist,
          their label or an archive. ResonTune stores the metadata and the link.
          It does not copy, re-encode, mirror or redistribute audio files, and
          it offers no download of catalog audio.
        </p>
        <p className="prose">
          Before publishing, the administrator is required to establish that the
          recording may be streamed this way — from the license it carries, from
          the rights holder's own publication of it, or from written permission.
          Public availability on the internet is never treated as permission on
          its own.
        </p>
      </LegalSection>

      <LegalSection id="fields" title="What the rights fields mean">
        <div className="legal-table-wrap">
          <table className="simple legal-table">
            <thead>
              <tr><th>Field</th><th>What it records</th></tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Field">License</td>
                <td data-label="What it records">
                  The license the recording is offered under — Creative Commons
                  variants, public domain (CC0), or “all rights reserved” with
                  permission to stream here. Each one carries its own summary,
                  its canonical URL and whether attribution is required.
                </td>
              </tr>
              <tr>
                <td data-label="Field">Rights holder</td>
                <td data-label="What it records">Who holds the rights to the recording.</td>
              </tr>
              <tr>
                <td data-label="Field">Attribution text</td>
                <td data-label="What it records">The exact credit line to use when the license requires attribution.</td>
              </tr>
              <tr>
                <td data-label="Field">Credits</td>
                <td data-label="What it records">Who wrote, performed, recorded or mastered it.</td>
              </tr>
              <tr>
                <td data-label="Field">Streaming permission</td>
                <td data-label="What it records">Whether it may be played on ResonTune at all.</td>
              </tr>
              <tr>
                <td data-label="Field">Distribution permission</td>
                <td data-label="What it records">
                  Whether it may be redistributed. This is off by default, and
                  it stays off unless the license or the rights holder says
                  otherwise.
                </td>
              </tr>
              <tr>
                <td data-label="Field">Territory</td>
                <td data-label="What it records">Where the permission applies, when the rights holder limits it.</td>
              </tr>
              <tr>
                <td data-label="Field">Rights notes</td>
                <td data-label="What it records">Anything else that qualifies the above.</td>
              </tr>
              <tr>
                <td data-label="Field">Source</td>
                <td data-label="What it records">
                  Whether the release is a ResonTune Original, a community
                  release, or an external one played from the host the rights
                  holder chose.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="prose">
          If a track is missing a license or a rights holder it does not get a
          publish state that puts it in front of listeners.
        </p>
      </LegalSection>

      <LegalSection id="listeners" title="What listeners may do">
        <p className="prose">
          Play it. Share the link. Beyond that, the license on the track page
          governs: a CC BY recording can be reused with credit, a CC BY-NC one
          only outside commercial use, an “all rights reserved” one not at all
          without asking. ResonTune's own code is MIT-licensed, which says
          nothing about the music — the two licenses are separate and the music
          is never covered by the code license.
        </p>
      </LegalSection>

      <LegalSection id="artists" title="If you are the artist or rights holder">
        <p className="prose">
          You decide whether your work is here. You can ask for a correction to
          any field — credits, attribution, license, links — or ask for the
          release to be removed, and you do not need to give a reason for
          removal. Requests from the rights holder are honoured; the record of
          the decision is kept so the catalog stays auditable.
        </p>
      </LegalSection>

      <LegalSection id="report" title="Reporting infringement or a mistake">
        <p className="prose">
          Contact the maintainers through the repository —{' '}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            open an issue
          </a>{' '}
          for public matters, or use the private contact listed on the
          repository profile if the request contains personal or legal detail.
          Useful reports include:
        </p>
        <ul className="legal-list">
          <li>a link to the ResonTune track, release or artist page;</li>
          <li>what the work is, and who holds the rights;</li>
          <li>the basis of your claim — you are the rights holder, or you act for them;</li>
          <li>whether you want a correction or a removal;</li>
          <li>a way to reach you.</li>
        </ul>
        <p className="prose">
          Reports are reviewed by hand by a small team, so no response time is
          promised here — an invented deadline would be worse than an honest
          one. Removals are recorded with the reason and who asked, the entry
          stops being playable and stops appearing in listings. Deliberately
          false claims are not a neutral act; they take a real recording away
          from the artist who published it.
        </p>
      </LegalSection>

      <LegalSection id="also" title="Related">
        <p className="prose">
          The catalog rules and moderation process are documented in the
          repository (
          <a href={`${REPO_URL}/blob/main/docs/catalog-model.md`} target="_blank" rel="noreferrer">
            catalog model
          </a>
          ,{' '}
          <a href={`${REPO_URL}/blob/main/docs/moderation.md`} target="_blank" rel="noreferrer">
            moderation
          </a>
          ). See also the <Link to="/terms">terms of use</Link> and{' '}
          <Link to="/privacy">privacy</Link> pages.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
