# Provider adapters

`src/providers/index.ts` defines the contract:

```ts
interface MusicProvider {
  id: string;
  supports(source: TrackSource): boolean;
  resolve(source: TrackSource): Promise<Resolution>;
}

type Resolution =
  | { type: 'stream'; url: string; mimeType?: string | null }
  | { type: 'external'; url: string; label: string }
  | { type: 'unavailable'; reason: string };
```

A track's `sources[]` are tried in priority order; the first provider that
`supports()` a source resolves it. Results:

- `stream` — the player loads the URL into the audio element.
- `external` — the UI offers official external playback (link/embed).
- `unavailable` — the next source is tried; if none work, the UI says so
  honestly instead of showing a dead play button.

## Built-in providers

| Provider | Sources | Behavior |
| --- | --- | --- |
| `HostedProvider` | `hosted` + `direct_url` | Plays the URL as-is (admin-managed today, object storage later) |
| `ExternalLinkProvider` | `youtube` / `soundcloud` / `other` + `embed`/`external_link` | Resolves to official external playback |
| Local resolution | `local` (device files) | Object URLs from IndexedDB blobs, cached and revoked in a bounded LRU |

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
`embed`/`external` resolution — **do not** force it into the `stream` shape.
Fundamentally incompatible services should not be crammed into the common
abstraction; extend the `Resolution` union instead.
