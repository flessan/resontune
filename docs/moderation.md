# Catalog administration & moderation

Music intake happens **outside** ResonTune, in the community channels
(Discord / Telegram / WhatsApp — configured via `COMMUNITY_*_URL` or the
site settings). ResonTune itself stores no submission records: no upload
state, no submission status, no pending queue. The in-app **Release music**
page is link-only.

## Release flow

1. A creator contacts the team through a community channel.
2. Rights and licensing are discussed like humans: who holds the rights,
   which license applies, whether streaming and/or redistribution is
   permitted.
3. A catalog administrator publishes approved music directly into the real
   catalog (artist, album, track, `track_sources`), recording the declared
   license, rights holder and permissions **verbatim** — ResonTune never
   invents or auto-assigns rights.

## Administration (`/moderation`)

Requires a server-verified `moderator` or `admin` role. Roles come from
`ADMIN_USER_IDS` / `MODERATOR_USER_IDS` env allowlists or grants stored in
`users.role` — evaluated per request on the server; nothing client-side is
ever trusted.

The admin surface manages **content states** of the real catalog:

`published | unlisted | taken_down | archived`

`POST /api/moderation/tracks/:id/state` requires a reason; every change is
appended to the `takedowns` table (actor, previous → next state, reason) —
auditable and never silently rewritten. After a takedown, playback returns
410 and public catalog queries stop returning the track, while all metadata
is preserved for auditing.

## Licensing stance

- The published catalog stays rights-aware: license, rights holder,
  attribution requirements, and streaming/distribution permissions are
  stored per track and displayed on every track page.
- Public accessibility ≠ redistribution rights, and the UI never implies
  otherwise.
- Takedown requests are honored, logged, and auditable.
