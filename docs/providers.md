# Providers & playback resolution

Playback is resolved **server-side**. The client (`src/providers/index.ts`)
calls `GET /api/play/:trackId` and receives:

```ts
type Resolution =
  | { type: 'stream'; url: string; mimeType?: string | null }   // load into <audio>
  | { type: 'external'; url: string; label: string }            // official external playback
  | { type: 'unavailable'; reason: string };                    // said honestly, no dead buttons
```

The server (`server/routes/play.ts`) walks the track's `sources[]` in
priority order, enforces content state (takedowns → 410) and
`streaming_permission` (→ 403), maps hosted object keys onto
`AUDIO_CDN_BASE`, and returns the first playable resolution. Catalog
endpoints never expose raw source URLs - the resolver is the only door.

## Built-in source handling

| Source | Behavior |
| --- | --- |
| `original_hosted` / `community_hosted` (`direct_url`) | Object key → `AUDIO_CDN_BASE` (dev: `/media/audio`, prod: object storage/CDN, later signable) |
| `remote` (`direct_url`) | Rights-holder-managed URL played as-is |
| `external` (`external_link` / `embed`) | Resolves to official external playback with a labeled link |
| Local device files | Client-only: object URLs from IndexedDB blobs, cached and revoked in a bounded LRU - never touch the server |

## Rules for new providers

A provider PR must document which mechanism it uses and why it's permitted
(official API, oEmbed, public metadata API, embed SDK…). The following are
rejected outright:

- DRM or authentication bypass
- premium-account circumvention
- hidden/private API abuse, scraping prohibited endpoints
- rate-limit evasion
- proxying or capturing protected streams
- unauthorized downloading

If a service only permits embedded playback, the adapter should return an
`embed`/`external` resolution - **do not** force it into the `stream` shape.
Fundamentally incompatible services should not be crammed into the common
abstraction; extend the `Resolution` union instead.
