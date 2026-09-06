# Profiles & the catalog manager

Two related surfaces ship together: what a **member** looks like on
ResonTune, and how an **administrator** puts music into the catalog. They
share one rule — ResonTune stores *addresses and metadata*, never media
bytes.

## Member profiles

| Field | Column | Notes |
| --- | --- | --- |
| Username | `users.handle` | The handle *is* the username: unique, lowercase, 3–24 chars, `a–z 0–9 . - _`, must start/end alphanumeric, cannot collide with a reserved route (`admin`, `settings`, `u`, …). |
| Display name | `users.display_name` | Free text, 1–60 chars. |
| Bio | `users.bio` | Up to 600 chars, preserved line breaks. |
| Location | `users.location` | Free text, 80 chars. |
| Website | `users.website_url` | Validated like every other URL (below). A scheme-less value is read as `https://`. |
| Avatar | `users.avatar_url` / `avatar_thumb_url` | Hosted by ImgBB, see below. Falls back to initials. |
| External links | `entity_links` (`entity_kind='user'`) | Up to 8, ordered, `provider` inferred from the host when not given. |
| Joined | `users.created_at` | Displayed as the join date. |
| Role | resolved server-side | `listener` / `moderator` / `admin`; `ADMIN_USER_IDS` and `MODERATOR_USER_IDS` always win over the column. |

Public page: `/u/<username>`. Editor: `/profile/edit` (own account only —
ownership comes from the verified token, never from the request body).
`/profile` redirects to your own public page.

### Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/users/:username` | public | Profile, public playlists, linked artists, counts |
| `GET` | `/api/me/profile` | session | Editable copy of your own profile |
| `PATCH` | `/api/me/profile` | session | Display name, username, bio, location, website, links |
| `GET` | `/api/me/username-available?username=` | session | Live availability + normalized form |
| `POST` | `/api/me/avatar` | session | Raw image bytes → ImgBB → stored URL |
| `DELETE` | `/api/me/avatar` | session | Back to initials |

### Avatars (the only upload path in ResonTune)

```
browser ──raw image bytes──► ResonTune API ──multipart──► api.imgbb.com
                                   │
                                   └── stores the returned URL in Postgres
```

- `IMGBB_API_KEY` is read **server-side only**. It is never sent to the
  client, never prefixed with `VITE_`, and never written to the database.
  Without it the endpoint answers `503` and the UI says photo uploads are
  unavailable — everything else keeps working.
- Validation before anything leaves the server: `≤ 4 MB`, declared MIME in
  `image/jpeg|png|webp|gif`, and the *actual* file signature (magic bytes)
  must match the declared type.
- No image bytes are stored by ResonTune, in Postgres or on disk.
- Album artwork and audio never use this path.

## The catalog manager

`/admin` — visible to moderators (read-only) and administrators (full
edit). Every mutation is re-checked server-side with `requireAdmin`; the
client's read-only mode is a courtesy, not a control.

```
Overview     counts by status, recently modified, things needing attention
Artists      list · search · status filter · quick publish/unlist · editor
Releases     list · search · status filter · editor with track ordering
Tracks       list · search · status filter · "no audio URL" filter · editor
```

### The verification workflow

The manager is built around the order a human actually works in:

1. **Create / edit** the record and its metadata.
2. **Paste the audio URL** — a direct `https://` link to the file on the
   host you approved.
3. **Paste the artwork URL** (or inherit the release's).
4. **Validate** — the form checks the shape of the URL as you type and the
   server re-validates on save.
5. **Preview** — artwork renders inline and audio plays in a plain `<audio>`
   element, loaded *by your browser, directly from the host*. ResonTune's
   server never fetches, downloads, mirrors or proxies the media.
6. **Publish** — status becomes `published` (or `unlisted` for a private
   link, `taken_down` / `archived` to withdraw).

### Media stays where the admin put it

ResonTune hosts no music and no artwork. `track_sources` records what was
pasted:

| Input | provider | kind | storage | source_type |
| --- | --- | --- | --- | --- |
| Direct audio URL | `other` | `direct_url` | `manual-url` | `remote` |
| Official page URL | inferred from host | `external_link` | `external` | `external` |

A direct URL gets `priority 0` (preferred), the external page `priority 10`
(fallback). MIME type is guessed from the file extension — a hint for the
player, not a claim about the file.

### URL validation (same rules everywhere)

Applied to avatars' neighbours — website, profile links, artist images,
release artwork, track audio/artwork/links:

- `https://` only (plain `http://` is allowed solely for `localhost` in
  development, never in production).
- No credentials in the URL (`https://user:pass@…` is rejected).
- No loopback, private, link-local, carrier-NAT or multicast literals; no
  IPv6 literals; no `.local` / `.internal` / `.lan`; no single-label hosts.
- Audio and artwork URLs must point at a path, not a bare origin.
- Max 500 characters.
- **Validation is offline by construction.** The server parses the URL; it
  never requests it. There is no server-side fetch of admin-supplied
  addresses anywhere in the codebase, so this feature adds no SSRF surface.

### Endpoints

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/overview` | moderator | Counts, recent changes, warnings |
| `GET` | `/api/admin/licenses` | moderator | License picker options |
| `GET` | `/api/admin/users/search?q=` | moderator | Link an artist to an account |
| `GET` | `/api/admin/artists` `?q&status` | moderator | List |
| `POST` | `/api/admin/artists` | admin | Create |
| `GET` | `/api/admin/artists/:id` | moderator | Artist + its releases and tracks |
| `PATCH` | `/api/admin/artists/:id` | admin | Edit / publish / unpublish |
| `DELETE` | `/api/admin/artists/:id` | admin | Delete (blocked while it has music) |
| `GET/POST/PATCH/DELETE` | `/api/admin/releases[/:id]` | as above | Releases |
| `POST` | `/api/admin/releases/:id/reorder` | admin | `{ trackIds: [] }` → track numbers |
| `GET/POST/PATCH/DELETE` | `/api/admin/tracks[/:id]` | as above | Tracks |

Status changes are ordinary `PATCH { status }` calls; every change to a
track's status also writes a `takedowns` audit row.

### Artists and accounts

`artists.user_id` is optional. Artists work with no account at all; linking
one records the relationship (and shows the artist on that member's
profile) and leaves room for a claim workflow later. No claim/approval
system exists today, by design.

### Visibility rules

A track is public only when the track **and** its artist **and** (if it has
one) its release are `published` or `unlisted`. Withdrawing an artist
therefore withdraws their whole catalog in a single write — lists, search,
home, artist and release pages all stop returning it, and
`GET /api/play/:id` answers `410`.

There is no submission queue, no approval table, and no seeded demo
catalog. Music intake happens in the community channels; the manager is
where an administrator records what was agreed.
