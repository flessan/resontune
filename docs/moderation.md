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

`/moderation` (role `moderator` or `admin` — the first account on a fresh
dev database is admin):

- filter queue by status
- inspect all metadata, open the audio URL, preview it inline
- *Start reviewing* → marks `reviewing`
- *Approve & publish* → materializes catalog rows in one step:
  - artist (found by name or created)
  - album (optional, found or created)
  - track (+ license, rights holder, description)
  - `track_sources` row (`hosted` / `direct_url` / `manual-url` storage)
  - lyrics and genre when provided
- *Reject* → keeps the record with the note; nothing enters the catalog

Takedowns after publication use `tracks.status = 'hidden' | 'removed'`
(data preserved, hidden from all public queries).

## Licensing stance

- ResonTune never invents or auto-assigns licenses — the submitter picks
  what the rights holder actually chose, and moderators verify.
- License, rights holder, and attribution requirements are displayed on
  every track page. Public accessibility ≠ redistribution rights, and the
  UI never implies otherwise.
