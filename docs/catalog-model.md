# Catalog model: provenance, rights, and content states

ResonTune's catalog is organized around one idea: **every playable thing has
an inspectable origin and an explicit rights record.** Nothing is implied,
nothing is invented.

## Provenance (`source_type`)

Artists, releases and tracks carry a `source_type`:

| value | meaning |
| --- | --- |
| `original` | Released and distributed by **ResonTune Originals** — hosted by the platform, with the rights actually held by the platform. Shown with the `RESONTUNE ORIGINAL` wordmark. |
| `community` | Released by an independent artist through the community channels and published by catalog administrators. Shown with the `Community` chip. |
| `external` | Discovery-only entries whose playback happens through an official external provider. Shown with the `External` chip. |

Local device files are a fourth world that never touches the server — they
exist only in the listener's browser and are always labeled `Local`.

Track *sources* (the rows describing actual audio) have their own axis,
`track_sources.source_type`: `original_hosted`, `community_hosted`,
`remote`, `external`. Hosted sources may use `object_key` instead of a raw
URL, which the playback resolver maps onto `AUDIO_CDN_BASE` — that's the
seam where S3/R2/object storage plugs in without schema or client changes.

## Playback resolution

The client never plays from database fields. It calls
`GET /api/play/:trackId`, and the server decides:

- `410` if the track is `taken_down` or `archived`
- `403` if `streaming_permission` is false
- `{ mode: 'stream', url, mimeType }` for hosted/remote audio
- `{ mode: 'external', url, label }` when playback must happen on the
  official provider page (never faked, never proxied)

This is the single enforcement point for takedowns, permissions, and —
later — signed CDN URLs.

## Rights model

Per track: `rights_holder`, `credits`, `license_id`, `attribution_text`,
`distribution_permission`, `streaming_permission`, `territory`,
`rights_notes`.

Rules:

- Rights are **recorded from declarations**, never assumed. A submitter's
  statements go into the payload verbatim and survive into the catalog row.
- A publicly reachable URL is *not* treated as permission to redistribute.
  `distribution_permission` defaults to `false`; community publishing sets
  it only from the artist's explicit declaration.
- Originals are marked as officially distributed because the platform
  actually holds those rights (see below).

## Content states

`published | unlisted | taken_down | archived` on tracks and albums.
Takedowns block playback (410) and discovery (404) while preserving all
metadata, and each state change is recorded in the `takedowns` audit table
with reason and actor. (Music intake happens in the external community
channels — there is no submission state machine in the database; see
[moderation.md](moderation.md).)

This separation is what makes revisions, takedowns, re-publications and
rights changes possible without corrupting the review history.

## Collections

Collections are the editorial layer — *not* playlists. A collection has a
title, description, artwork, curator and publication status, and holds an
**ordered mix of tracks, releases and artists**, each with an optional
curator note. They power the homepage editorial sections and
`/collections`.

## Roles and authorization

All privileged actions are authorized server-side per request:

- Production roles come from `ADMIN_USER_IDS` / `MODERATOR_USER_IDS`
  (comma-separated user ids) which override the `users.role` column, plus
  roles granted by an existing admin in that column.
- "First account becomes admin" is a **development-only** convenience; the
  code path is disabled when `NODE_ENV=production`.
- Nothing client-side (localStorage, hidden UI, role fields in requests) is
  ever trusted; hitting a moderation endpoint without a server-verified
  moderator session returns 401/403 regardless of what the UI shows.
