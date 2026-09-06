# Submissions & moderation

Community submission is a core feature — and the main abuse surface, so it
is deliberately conservative.

## Submitter flow

1. Sign in (submissions are account-bound so status can be tracked).
2. `/submit` — artist, title, release, genre, description, artwork URL,
   **audio source URL**, lyrics, license, rights holder, external links.
3. Mandatory confirmation: *"I am the creator or an authorized
   representative of the rights holder."*
4. Status is visible on the same page: `PENDING → REVIEWING →
   APPROVED / REJECTED`, including the moderator's note.

Server-side constraints (`server/routes/me.ts`):

- zod validation of every field (lengths, URL shapes, known license id)
- 60-second cooldown between submissions
- max 5 submissions awaiting review per user
- global write rate limits on top

## Moderator flow

`/moderation` requires a server-verified `moderator` or `admin` session.
In production, roles come from `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` or
grants stored in `users.role`; on a fresh *development* database the first
account becomes admin (that shortcut is disabled under
`NODE_ENV=production`).

Lifecycle: `pending → reviewing → approved → published` (or `rejected`).

- filter queue by status
- inspect all metadata, open the audio URL, preview it inline
- *Start reviewing* → marks `reviewing`
- *Approve* → records the decision (nothing public yet)
- *Publish to catalog* → materializes catalog rows:
  - artist (found by name or created, `source_type='community'`)
  - album (optional, found or created)
  - track (+ license, rights holder, declared permissions, provenance)
  - `track_sources` row (`community_hosted`)
  - lyrics and genre when provided
- *Reject* → keeps the record with the note; nothing enters the catalog

Two note channels: the **moderator note** is shown to the submitter; the
**internal note** never leaves moderation endpoints. Every transition is
appended to `moderation_events` (actor, from → to, both notes) — decisions
are auditable and never silently rewritten.

Takedowns after publication use
`POST /api/moderation/tracks/:id/state` with
`status ∈ published | unlisted | taken_down | archived` and a required
reason; the change is logged in the `takedowns` table, playback returns
410 and public catalog queries stop returning the track — all metadata is
preserved for auditing.

## Licensing stance

- ResonTune never invents or auto-assigns licenses — the submitter picks
  what the rights holder actually chose, and moderators verify.
- License, rights holder, and attribution requirements are displayed on
  every track page. Public accessibility ≠ redistribution rights, and the
  UI never implies otherwise.
