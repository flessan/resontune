/**
 * Normalized external links.
 *
 * One table (`entity_links`) serves profiles, artists, releases and tracks:
 * provider + label + url + ordering. Callers validate URLs before writing -
 * this module only stores and reads.
 */
import { getDb, uuid } from './index.ts';

export type LinkEntityKind = 'user' | 'artist' | 'album' | 'track';

export interface EntityLink {
  provider: string;
  label: string;
  url: string;
  position: number;
}

export interface LinkInput {
  provider?: string | null;
  label?: string | null;
  url: string;
}

/** Providers we recognise for iconography/labelling. Free text is allowed. */
export const KNOWN_PROVIDERS = [
  'website', 'bandcamp', 'soundcloud', 'spotify', 'youtube', 'apple-music',
  'instagram', 'x', 'mastodon', 'discord', 'telegram', 'github', 'kofi',
  'patreon', 'other',
] as const;

export function normalizeProvider(raw: string | null | undefined, url: string): string {
  const explicit = (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30);
  if (explicit) return explicit;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'website';
  }
  const guess: Record<string, string> = {
    'bandcamp.com': 'bandcamp',
    'soundcloud.com': 'soundcloud',
    'open.spotify.com': 'spotify',
    'youtube.com': 'youtube',
    'youtu.be': 'youtube',
    'music.apple.com': 'apple-music',
    'instagram.com': 'instagram',
    'x.com': 'x',
    'twitter.com': 'x',
    'github.com': 'github',
    'ko-fi.com': 'kofi',
    'patreon.com': 'patreon',
    't.me': 'telegram',
    'discord.gg': 'discord',
  };
  if (guess[host]) return guess[host];
  if (host.endsWith('.bandcamp.com')) return 'bandcamp';
  return 'website';
}

export function defaultLabel(provider: string, url: string): string {
  const pretty: Record<string, string> = {
    website: 'Website', bandcamp: 'Bandcamp', soundcloud: 'SoundCloud',
    spotify: 'Spotify', youtube: 'YouTube', 'apple-music': 'Apple Music',
    instagram: 'Instagram', x: 'X', mastodon: 'Mastodon', discord: 'Discord',
    telegram: 'Telegram', github: 'GitHub', kofi: 'Ko-fi', patreon: 'Patreon',
  };
  if (pretty[provider]) return pretty[provider];
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

export async function listLinks(kind: LinkEntityKind, entityId: string): Promise<EntityLink[]> {
  const db = await getDb();
  const rows = await db.query<EntityLink>(
    `SELECT provider, label, url, position FROM entity_links
      WHERE entity_kind = $1 AND entity_id = $2 ORDER BY position, created_at`,
    [kind, entityId],
  );
  return rows;
}

/** Batch variant for list endpoints. */
export async function listLinksFor(
  kind: LinkEntityKind,
  entityIds: string[],
): Promise<Map<string, EntityLink[]>> {
  const out = new Map<string, EntityLink[]>();
  if (!entityIds.length) return out;
  const db = await getDb();
  const rows = await db.query<EntityLink & { entity_id: string }>(
    `SELECT entity_id, provider, label, url, position FROM entity_links
      WHERE entity_kind = $1 AND entity_id = ANY($2) ORDER BY position, created_at`,
    [kind, entityIds],
  );
  for (const row of rows) {
    const list = out.get(row.entity_id) ?? [];
    list.push({ provider: row.provider, label: row.label, url: row.url, position: row.position });
    out.set(row.entity_id, list);
  }
  return out;
}

/**
 * Replace every link of an entity with the supplied ordered list. Callers
 * must have validated the URLs (scheme/host safety) first.
 */
export async function replaceLinks(
  kind: LinkEntityKind,
  entityId: string,
  links: LinkInput[],
): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM entity_links WHERE entity_kind = $1 AND entity_id = $2`, [kind, entityId]);
  let position = 0;
  for (const link of links.slice(0, 12)) {
    const url = link.url.trim();
    if (!url) continue;
    const provider = normalizeProvider(link.provider, url);
    const label = (link.label ?? '').trim().slice(0, 40) || defaultLabel(provider, url);
    await db.query(
      `INSERT INTO entity_links (id, entity_kind, entity_id, provider, label, url, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuid(), kind, entityId, provider, label, url, position],
    );
    position += 1;
  }
}
