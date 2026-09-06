/**
 * Provider abstraction.
 *
 * Every playable track has an explicit source identity. A provider knows how
 * to resolve a Track (remote) or LocalTrack (device) into something the
 * player can actually use — a direct stream URL, an object URL, an embed, or
 * an external link when direct playback isn't permitted.
 *
 * Adding a provider means adding a module here — the player itself never
 * changes. Providers must only use permitted mechanisms: no DRM bypass, no
 * scraping protected endpoints, no proxying restricted streams.
 */
import type { Track, TrackSource, QueueItem, LocalTrack } from '@/lib/types';
import { getLocalBlob, getLocalArtwork } from '@/local/db';

export type Resolution =
  | { type: 'stream'; url: string; mimeType?: string | null }
  | { type: 'external'; url: string; label: string }
  | { type: 'unavailable'; reason: string };

export interface MusicProvider {
  id: string;
  /** Can this provider resolve the given source? */
  supports(source: TrackSource): boolean;
  /** Resolve a source into a playable stream / external link. */
  resolve(source: TrackSource): Promise<Resolution>;
}

/** Hosted catalog audio — direct URLs managed by ResonTune admins today,
 *  object storage / CDN later. The URL is used as-is. */
const HostedProvider: MusicProvider = {
  id: 'hosted',
  supports: (s) => s.provider === 'hosted' && s.kind === 'direct_url',
  resolve: async (s) => ({ type: 'stream', url: s.url, mimeType: s.mimeType }),
};

/**
 * External services (YouTube, SoundCloud, …). ResonTune does not proxy or
 * capture their streams — that would violate provider terms. Instead these
 * resolve to an official external playback experience.
 */
const ExternalLinkProvider: MusicProvider = {
  id: 'external',
  supports: (s) =>
    (s.provider === 'youtube' || s.provider === 'soundcloud' || s.provider === 'other') &&
    (s.kind === 'external_link' || s.kind === 'embed'),
  resolve: async (s) => ({
    type: 'external',
    url: s.url,
    label: s.provider === 'youtube' ? 'Watch on YouTube'
      : s.provider === 'soundcloud' ? 'Listen on SoundCloud'
      : 'Open source',
  }),
};

const providers: MusicProvider[] = [HostedProvider, ExternalLinkProvider];

export function registerProvider(p: MusicProvider): void {
  providers.push(p);
}

export async function resolveTrackSource(track: Track): Promise<Resolution> {
  for (const source of track.sources ?? []) {
    const provider = providers.find((p) => p.supports(source));
    if (provider) {
      try {
        const r = await provider.resolve(source);
        if (r.type !== 'unavailable') return r;
      } catch {
        /* try next source */
      }
    }
  }
  return { type: 'unavailable', reason: 'No playable source for this track.' };
}

/* ------------------------------ queue building ---------------------------- */

export function trackToQueueItem(track: Track): QueueItem | null {
  const direct = (track.sources ?? []).find((s) => s.provider === 'hosted' && s.kind === 'direct_url');
  if (!direct) return null;
  return {
    queueId: crypto.randomUUID(),
    origin: 'remote',
    id: track.id,
    title: track.title,
    artistName: track.artist.name,
    artistSlug: track.artist.slug,
    trackSlug: track.slug,
    albumTitle: track.album?.title ?? null,
    artworkUrl: track.artworkUrl,
    duration: track.duration,
    src: direct.url,
    mimeType: direct.mimeType,
  };
}

/** Local provider: resolve device files into object URLs on demand. */
const objectUrlCache = new Map<string, string>();

export async function resolveLocalSrc(localId: string): Promise<string | null> {
  const cached = objectUrlCache.get(localId);
  if (cached) return cached;
  const blob = await getLocalBlob(localId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  // Keep the cache bounded: revoke oldest beyond 12 entries.
  if (objectUrlCache.size >= 12) {
    const first = objectUrlCache.keys().next().value as string | undefined;
    if (first) {
      URL.revokeObjectURL(objectUrlCache.get(first)!);
      objectUrlCache.delete(first);
    }
  }
  objectUrlCache.set(localId, url);
  return url;
}

const artworkUrlCache = new Map<string, string>();

export async function resolveLocalArtworkUrl(localId: string): Promise<string | null> {
  const cached = artworkUrlCache.get(localId);
  if (cached) return cached;
  const blob = await getLocalArtwork(localId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  artworkUrlCache.set(localId, url);
  return url;
}

export function localTrackToQueueItem(t: LocalTrack, artworkUrl: string | null): QueueItem {
  return {
    queueId: crypto.randomUUID(),
    origin: 'local',
    id: t.id,
    title: t.title,
    artistName: t.artist,
    albumTitle: t.album,
    artworkUrl,
    duration: t.duration,
    src: '', // resolved lazily via resolveLocalSrc
    mimeType: t.mimeType,
  };
}
