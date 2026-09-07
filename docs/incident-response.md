# Incident response

What to do when something goes wrong with data or security in a ResonTune
deployment. Short on purpose: an incident is not the moment to read a policy
binder. There is no dashboard, no ticketing system and no on-call rota - this
is a small project, and the process is a checklist a maintainer can follow.

> Statutory notification deadlines differ by jurisdiction (many regimes use
> 72 hours from becoming aware; some are shorter for specific data). This
> document does not promise a deadline. The operator must know the rules that
> apply to them.

## 0. Scope

An **incident** is any of: unauthorized access to the database or the server,
leaked credentials (`DATABASE_URL`, `IMGBB_API_KEY`, Neon Auth keys), an
authorization bug that exposed one account's data to another, exposure of
private profile data, a compromised dependency, or a successful account
takeover.

Not an incident: a track that will not play, a rate limit doing its job, a
scraper hitting public endpoints.

## 1. Detect and record

- Write down the time you became aware and how (report, log, alert).
- Start an append-only note - one file, timestamps, plain text. Everything
  below refers back to it.
- Assign one person to coordinate. Everyone else reports to them.

## 2. Contain

Fastest safe action first:

- Revoke or rotate what is exposed: Neon database credentials, Neon Auth
  keys, `NEON_API_KEY` (the control-plane key used for identity deletion -
  revoke it in the Neon console; a project-scoped key limits the blast radius
  to one project), `IMGBB_API_KEY`, deploy tokens, any leaked developer
  credential.
- If a route is leaking, disable that route or take the deployment offline.
  Downtime is cheaper than continued exposure.
- If an account is compromised, remove its elevated role (`ADMIN_USER_IDS` /
  `MODERATOR_USER_IDS`, `users.role`) before anything else.
- To lock out a specific compromised sign-in immediately, delete the account
  (`DELETE /api/me` as that user) or insert its tombstone directly:
  `INSERT INTO deleted_identities (auth_provider, auth_subject, deleted_at,
  expires_at) VALUES ('neon', '<sub>', now(), now() + interval '24 hours')`.
  Every instance then refuses tokens issued before that moment. This revokes
  ResonTune access only; the Neon Auth session itself is revoked in Neon Auth.
- Do not "clean up" evidence. Contain, do not tidy.

## 3. Preserve evidence

- Snapshot logs before they rotate: application logs, hosting/CDN request
  logs, Neon activity, Neon Auth events.
- Note the deployed commit SHA and the migration state.
- Take a database snapshot (Neon PITR bookmark) before any remediation that
  changes data.

## 4. Investigate and scope

Answer, in writing:

- What was reachable? Which tables, which columns, which accounts?
- Was it read, modified or deleted? Read access to `users` differs sharply
  from access to `favorites`.
- Time window: first possible exposure to containment.
- How many accounts are affected, and can they be listed?
- Was any of it special-category or credential data? Note that ResonTune
  stores **no** passwords, emails or payment data (see
  [privacy-and-data.md](privacy-and-data.md) §1) - credential exposure almost
  certainly points at Neon Auth, not at this database.

## 5. Assess severity

| Severity | Example | Response |
| --- | --- | --- |
| Low | Public data served slightly wrong; no private field involved | Fix, note it, move on |
| Medium | One account's private field (history, private playlist) exposed to another | Fix, notify the affected user, publish a note |
| High | Database credentials leaked; bulk access to `users`; role escalation | Rotate everything, notify all users, assess regulatory notification |

## 6. Eradicate and recover

- Fix the root cause in code, with a regression test. A hotfix without a test
  is an invitation to repeat the incident.
- Rotate every secret that could plausibly have been seen, not just the
  proven ones.
- Restore data from the Neon snapshot only if data was destroyed, and record
  what the restore changed.
- Verify: run `npm run typecheck`, `npm test`, `npm run build`, and confirm
  the specific attack path is closed.

## 7. Communicate

- **Affected users**: what happened, what data was involved, when, what has
  been done, what they should do (for example: change your password *at Neon
  Auth*, review your playlists). Plain language, no euphemisms, no "we take
  your privacy seriously" filler.
- **Everyone else**: a short public note in the repository (a security
  advisory or a dated entry) once containment is complete.
- **Reporter**: if the incident came from a responsible disclosure,
  acknowledge and credit them if they want it.
- **Authorities**: where the operator's law requires notification, the
  operator makes that filing within the applicable deadline. Have the §4
  written scope ready - it is what the form asks for.
- Never publish exploit details before the fix is deployed.

## 8. Afterwards

- Write a short post-incident note: timeline, cause, fix, what would have
  caught it earlier.
- Fold the lesson into the code - a test, a validation rule, a documented
  check - not into a rule nobody will remember.
- Review whether the same class of bug exists elsewhere (authorization,
  ownership, URL validation, secret handling).

## Contacts

Report suspected vulnerabilities privately - see
[`SECURITY.md`](../SECURITY.md). Do not post reproduction details in a public
issue.
