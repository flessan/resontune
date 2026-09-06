# Privacy, data & compliance audit

An engineering audit of what ResonTune actually processes, written against
the code in this repository — the migrations in `server/db/migrations`, the
routes in `server/routes`, the auth layer in `server/auth.ts` and the browser
storage in `src/`. The user-facing summary of the same facts lives at
[`/privacy`](../src/pages/legal/Privacy.tsx).

> Not legal advice. Nothing here claims compliance with GDPR, CCPA or any
> other regime; several items below explicitly need a lawyer and an operator
> decision. Last reviewed against the implementation: **2026-09-06**.

## 1. Data inventory (server side)

Every column below exists in a migration. Nothing else about a person is
written by the application.

### `users`

| Column | Contents | Source | Purpose |
| --- | --- | --- | --- |
| `id` | UUID | generated | primary key for every owned row |
| `handle` | username | suggested at sign-up from the token's name/email local part, then user-editable | profile URL, public credit |
| `display_name` | free text | Neon Auth `name` claim at first sign-in, user-editable | display |
| `bio`, `location`, `website_url` | free text typed by the user | profile editor | public profile |
| `avatar_url`, `avatar_thumb_url`, `avatar_provider_id`, `avatar_source`, `avatar_updated_at` | ImgBB URLs/ids, or the provider picture URL | avatar upload / first sign-in | display |
| `role` | `listener \| moderator \| admin` | operator (`users.role` or `ADMIN_USER_IDS`/`MODERATOR_USER_IDS`) | authorization |
| `auth_provider`, `auth_subject` | `'neon'` + the Neon Auth user id | verified JWT `sub` | mapping a sign-in to an account |
| `created_at`, `updated_at` | timestamps | generated | "member since", cache/versioning |

**No email address, password, phone number, payment detail, IP address,
device fingerprint or geolocation is stored.** The email claim is read from
the verified token only to suggest a username for a brand-new account
(`handleFrom` in `server/auth.ts`); it is never written.

### Other user-linked tables

| Table | Key columns | Personal? | On account deletion |
| --- | --- | --- | --- |
| `playlists` | `owner_id` | yes (titles/descriptions are user text) | `ON DELETE CASCADE` |
| `playlist_tracks` | `playlist_id` | yes, via playlist | cascade with the playlist |
| `playlist_likes` | `user_id` | yes | `ON DELETE CASCADE` |
| `favorites` | `user_id, track_id, created_at` | yes | `ON DELETE CASCADE` |
| `play_history` | `user_id, track_id, played_at` | yes — listening history | `ON DELETE CASCADE` |
| `entity_links` (`entity_kind='user'`) | `entity_id` | yes | **no FK** — deleted explicitly by the delete route |
| `play_events` | `track_id, played_at` | **no** — no user, session or IP column | untouched |
| `collections.curator_id` | attribution | staff only | `SET NULL` |
| `community_picks.picked_by` | attribution | staff only | `SET NULL` |
| `takedowns.actor_id` | moderation audit | staff only | `SET NULL` |
| `site_settings.updated_by` | admin audit | staff only | `SET NULL` |
| `artists.user_id` | links a catalog artist page to an account | shared catalog record | `SET NULL` — **the artist page survives** |

The `sessions` table was dropped in migration `004`; sessions live in Neon
Auth, not here.

### Transient, not stored

- Per-IP rate-limit counters (`express-rate-limit`, in memory, 60-second
  window).
- `console.error` output for 5xx responses, which goes to the hosting
  provider's log stream. Operators should treat those logs as potentially
  containing request metadata and set their own retention.

## 2. Browser-side data

| Store | Key | Contents |
| --- | --- | --- |
| localStorage | `resontune-settings` | theme, visualizer mode and parameters |
| localStorage | `rt-nav-collapsed` | sidebar collapsed flag |
| IndexedDB | `resontune-local` → `tracks`, `blobs`, `artwork`, `playlists` | music files the user added from their device, plus extracted tags/art |
| IndexedDB | `resontune-local` → `kv` | queue snapshot, playback position, volume/rate/shuffle/repeat |
| Cache Storage | `resontune-v1-shell`, `resontune-v1-api` | app shell and recent `GET /api` responses for offline use (`public/sw.js`); `/media/*` is deliberately excluded |
| Neon Auth client | its own keys | the signed-in session, managed by `@neondatabase/neon-js/auth` |

**Cookies:** ResonTune sets none. There is no `document.cookie` write and no
`Set-Cookie` header anywhere in `server/`. Any cookie present belongs to Neon
Auth or the hosting/CDN layer. Because nothing is set for analytics or
advertising, no consent banner is implemented — and a fake one would be worse
than none. Operators who add a CDN or analytics later must revisit this.

**Tracking:** no analytics SDK, no pixel, no beacon, no session recorder, no
A/B framework, no third-party font or script CDN (Poppins is bundled through
`@fontsource`). Verified by grep: the only outbound calls the client makes are
to its own `/api`, to the Neon Auth URL, and to the media/artwork URLs stored
in the catalog.

## 3. Third parties

| Service | Role | What it receives |
| --- | --- | --- |
| Neon (Postgres) | the database | everything in §1 |
| Neon Auth | authentication | email, credentials, provider identities, sessions; issues the JWT this API verifies |
| ImgBB | avatar hosting only | the image bytes of a profile photo, uploaded server-side with `IMGBB_API_KEY`; the URL comes back and is stored |
| External media hosts | serve catalog audio/artwork for linked releases | the listener's IP and user agent, because the browser fetches media directly from them |
| The deployment itself | serves audio for ResonTune Originals / hosted community releases (`track_sources.object_key` → `/media/audio` or `AUDIO_CDN_BASE`) | ordinary web-server request logs, at the operator's configuration |
| Hosting provider | runs the server | request logs, at the operator's configuration |

No data-processing claims are made on any of their behalf; their own terms
apply. ResonTune uploads nothing to ImgBB except avatars, and stores no image
bytes in Postgres.

## 4. Retention (actual behaviour)

There is **no scheduled deletion job in the codebase**. What exists:

- Account, profile, playlists, favorites, likes: until the user edits or
  deletes them, or deletes the account.
- Listening history: until `DELETE /api/me/history` or account deletion.
- Anonymous `play_events`: kept indefinitely; contains no identity.
- Takedown and editorial records: kept as an audit trail, anonymized on
  account deletion.
- Backups/PITR: Neon's, on the operator's plan. Deleted rows can persist in
  snapshots for that window. **Operator/legal decision.**

## 5. Self-service rights (implemented)

| Right | Endpoint | UI |
| --- | --- | --- |
| Access / portability | `GET /api/me/export` | Settings → Your data → Export |
| Rectification | `PATCH /api/me/profile`, `POST/DELETE /api/me/avatar` | Profile editor |
| Erasure (history) | `DELETE /api/me/history` | Settings → Clear history |
| Erasure (application data) | `DELETE /api/me` (requires the username as confirmation) | Settings → Delete account |
| Erasure (sign-in identity) | `POST {NEON_AUTH_URL}/delete-user`, called by the browser from the user's own Neon Auth session | same flow, immediately after the call above |

All the ResonTune endpoints take the account from the verified token; none
accepts a user id from the client. The export omits `auth_subject`,
`auth_provider`, roles of other users and anything owned by anyone else, and
says so in a `notIncluded` field that is checked against the payload in
`server/privacy.test.ts`.

### Two-part account deletion

"Delete account" covers two systems, and the product says so at every step:

1. **ResonTune data** — `DELETE /api/me` cascades everything the account owns
   and unlinks the shared records (§1). This always happens.
2. **The Neon Auth identity** — email address, password, sessions. Neon Auth
   is Better Auth, whose `POST /delete-user` endpoint is authenticated by the
   *user's own session*, not by an API key. ResonTune deliberately holds no
   Neon Auth admin credential, so the browser makes that call itself
   (`deleteIdentity()` in `src/lib/authClient.ts`) right after step 1. Three
   outcomes are possible and each is reported verbatim to the user:
   identity deleted; a verification email sent (identity still exists until
   the link is opened); or the endpoint is disabled for the deployment
   (`user.deleteUser.enabled` off → HTTP 404), in which case the UI states
   that the identity was *not* deleted and points at Neon Auth.

Because a JWT is stateless, a token minted before the deletion would happily
recreate an empty account on the next request. `server/auth.ts` therefore
keeps an in-memory tombstone — the provider subject and the deletion
timestamp, nothing else, dropped after 24 hours — and treats any token
*issued before* that moment as anonymous. A genuinely new sign-in produces a
token issued afterwards and creates a new, empty account, which is what the
privacy page describes. The tombstone is per-process and therefore best
effort on a multi-instance deployment; it is a safety net, not the security
boundary (the security boundary is that the row is gone).

Local browser state after deletion: the session token and the API response
cache (`resontune-v1-api`) are cleared. IndexedDB `resontune-local` (the
user's own music, artwork and queue) and `resontune-settings` are **not**
touched — they are the person's own data on their own device, and deleting a
server row is no reason to erase their files.

## 6. GDPR-shaped risk review

Structural observations only — a supervisory-authority-proof assessment is
not something a repository can produce.

| Topic | State | Needs a human |
| --- | --- | --- |
| Lawful basis | Not asserted anywhere. Accounts are voluntary and the data is what the feature needs. | **Yes** — the operator must decide and state the basis (likely contract for account features, legitimate interest for abuse prevention). |
| Data minimisation | Strong: no email, no IP, no device data, anonymous play counts. | No |
| Purpose limitation | Each table maps to one product feature (§1). | No |
| Transparency | `/privacy` + this document. | Review wording per jurisdiction |
| Access / rectification / erasure | Implemented self-service (§5). | No |
| Retention limits | Documented, but unbounded for history and audit records. | **Yes** — set periods per jurisdiction |
| Processors | Neon, ImgBB, host (§3). | **Yes** — DPAs / processor agreements are contracts, not code |
| International transfers | Depends entirely on the Neon region and the host. | **Yes** |
| Privacy by design | No account needed to listen; anonymous playback; local music never uploaded; secrets server-side. | No |
| Security | See `SECURITY.md` and §8. | Periodic review |
| Breach notification | Runbook in `docs/incident-response.md`; statutory deadlines are jurisdictional. | **Yes** |
| Children's data | No age gate. | **Yes** — depends on the deployment's audience/jurisdiction |
| DPO / representative | Not applicable to a repository; an operator may need one. | **Yes** |

## 7. Payments, consent and dark-pattern audit

Searched for `stripe`, `paypal`, `checkout`, `subscription`, `billing`,
`price`, `premium`, `trial`, `paywall`, `PaymentRequest`: **no payment code
exists**. There is no premium flag in the schema, no entitlement check in any
route, and no feature gated behind money. The Support page renders optional
external donation links the admin configures (`site_settings`), and giving
changes nothing about the product.

Consent surfaces audited:

- No pre-ticked checkboxes anywhere (the sign-in dialog states the terms and
  links to them; it does not ask for a tick).
- No cookie banner, because no cookies are set for tracking.
- No newsletter opt-in, no bundled consent, no "recommended" default that
  costs money or shares data.
- Deletion is two deliberate steps and no more: a confirmation dialog that
  lists the consequences, then typing your own username. No retention offer,
  no "you'll lose your streak", no support-ticket requirement.
- Destructive actions are visually separated and labelled with what they do
  (`danger` styling, "Delete account", "Clear history"), never with a
  cheerful euphemism.

## 8. Security review notes (privacy-relevant)

- Every mutating route resolves the actor from a cryptographically verified
  Neon Auth JWT (`jwtVerify` against the JWKS, EdDSA, issuer + expiry
  checked). Nothing in a request body selects an account.
- Ownership is enforced in SQL (`WHERE owner_id = $1` / `WHERE id = $1` with
  the session id), not in the client.
- Roles come from the server (`effectiveRole`), with env allowlists
  overriding the column, so a stray DB write cannot mint an admin.
- `IMGBB_API_KEY` is server-only; the deployment doc's `grep -r IMGBB dist/`
  check is part of the release routine (see §9 of this file's test coverage
  in `server/privacy.test.ts`).
- Media URLs are validated offline (`server/util/urlSafety.ts`): https only,
  no credentials, no private/loopback/link-local/CGNAT literals, no IPv6
  literals, no `.local/.internal/.lan`, no single-label hosts, length capped.
  The server never fetches a submitted URL, so validation itself creates no
  SSRF surface.
- Public profile serialization (`server/util/profile.ts`) has a fixed column
  list; auth identifiers cannot leak through it.

## 9. Known gaps

1. Deleting the Neon Auth identity depends on the deployment: Better Auth's
   self-service deletion must be enabled on the Neon Auth project, and it may
   require a fresh session, the account password or an email confirmation.
   When it is unavailable the UI says the identity still exists and where to
   delete it. **Operator decision:** enable self-service deletion on the Neon
   Auth project if you want one-step deletion.
2. No automated retention/cleanup jobs; retention is manual.
3. Hosting-layer logs are outside the application's control.
4. Backups retain deleted rows for the provider's window.
5. No age verification.
6. Legal review of `/privacy`, `/terms` and `/copyright` has not happened;
   the pages describe behaviour, not obligations.
7. The deletion tombstone is per-process. A multi-instance deployment that
   wants the same guarantee everywhere would need shared state — deliberately
   not built, since it would mean storing something about deleted users.
