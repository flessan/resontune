/**
 * Shared helpers for the admin catalog manager.
 *
 * The catalog manager is a small internal CMS: administrators type metadata
 * and paste *already-hosted* direct media URLs. ResonTune never uploads,
 * downloads, proxies or inspects those URLs — it validates their shape and
 * stores them.
 */
import { getDb, slugify, uuid } from '../../db/index.ts';
import { HttpError } from '../../util/http.ts';
import { replaceLinks, type LinkInput } from '../../db/links.ts';
import { coerceHttps, validateAudioUrl, validateImageUrl, validateLinkUrl } from '../../util/urlSafety.ts';

export const UUID_RE = /^[0-9a-f-]{36}$/;

export const CATALOG_STATUSES = ['published', 'unlisted', 'taken_down', 'archived'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const SOURCE_TYPES = ['original', 'community', 'external'] as const;

export function requireUuid(value: unknown, label = 'id'): string {
  const id = String(value ?? '');
  if (!UUID_RE.test(id)) throw new HttpError(400, `Bad ${label}.`);
  return id;
}

/** Build a unique slug for a catalog table, keeping an existing row's slug. */
export async function uniqueSlug(
  table: 'artists' | 'albums' | 'tracks',
  desired: string,
  excludeId?: string,
): Promise<string> {
  const db = await getDb();
  const base = slugify(desired);
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    const rows = await db.query(
      `SELECT 1 FROM ${table} WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''}`,
      excludeId ? [candidate, excludeId] : [candidate],
    );
    if (!rows.length) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${uuid().slice(0, 6)}`;
}

/* ------------------------------ URL validation ---------------------------- */

/*
 * Each helper returns the *normalized* value the caller should store: a
 * scheme-less value is read as https, then validated like anything else.
 */
export function assertAudioUrl(raw: string): string {
  const url = coerceHttps(raw);
  const err = validateAudioUrl(url);
  if (err) throw new HttpError(400, `Audio URL: ${err}`);
  return url;
}

export function assertArtworkUrl(raw: string): string {
  const url = coerceHttps(raw);
  const err = validateImageUrl(url);
  if (err) throw new HttpError(400, `Artwork URL: ${err}`);
  return url;
}

export function assertImageUrl(raw: string, label: string): string {
  const url = coerceHttps(raw);
  const err = validateImageUrl(url);
  if (err) throw new HttpError(400, `${label}: ${err}`);
  return url;
}

export function assertExternalUrl(raw: string, label: string): string {
  const url = coerceHttps(raw);
  const err = validateLinkUrl(url);
  if (err) throw new HttpError(400, `${label}: ${err}`);
  return url;
}

export function assertLinks(links: LinkInput[] | undefined): LinkInput[] | undefined {
  if (!links) return links;
  return links.map((link) => {
    const url = coerceHttps(link.url);
    const err = validateLinkUrl(url);
    if (err) throw new HttpError(400, `Link ${url.slice(0, 40)}: ${err}`);
    return { ...link, url };
  });
}

export async function syncLinks(
  kind: 'user' | 'artist' | 'album' | 'track',
  entityId: string,
  links: LinkInput[] | undefined,
): Promise<void> {
  if (!links) return;
  await replaceLinks(kind, entityId, links);
}

/* --------------------------------- genres --------------------------------- */

/** Ensure genre rows exist for the supplied names and attach them to a track. */
export async function syncTrackGenres(trackId: string, names: string[] | undefined): Promise<void> {
  if (!names) return;
  const db = await getDb();
  await db.query(`DELETE FROM track_genres WHERE track_id = $1`, [trackId]);
  const seen = new Set<string>();
  for (const raw of names.slice(0, 8)) {
    const name = raw.trim().slice(0, 40);
    if (!name) continue;
    const id = slugify(name);
    if (seen.has(id)) continue;
    seen.add(id);
    await db.query(
      `INSERT INTO genres (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, name],
    );
    await db.query(
      `INSERT INTO track_genres (track_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [trackId, id],
    );
  }
}

/* ------------------------------ track sources ----------------------------- */

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

export function guessAudioMime(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    for (const [ext, mime] of Object.entries(MIME_BY_EXTENSION)) {
      if (path.endsWith(ext)) return mime;
    }
  } catch {
    /* unparseable URLs never reach here — they fail validation first */
  }
  return null;
}

function externalProviderFor(url: string): 'youtube' | 'soundcloud' | 'other' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.endsWith('soundcloud.com')) return 'soundcloud';
  } catch {
    /* validated earlier */
  }
  return 'other';
}

/**
 * Replace a track's media sources with the administrator's manually verified
 * URLs. `audioUrl` is the direct stream; `externalUrl` is an official page
 * used when there is no streamable file.
 */
export async function setTrackSources(
  trackId: string,
  audioUrl: string | null,
  externalUrl: string | null,
): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM track_sources WHERE track_id = $1`, [trackId]);
  if (audioUrl) {
    // 'remote' = a direct URL managed by the rights holder / admin-chosen
    // host. ResonTune stores the URL and never fetches or copies the file.
    await db.query(
      `INSERT INTO track_sources
         (id, track_id, provider, kind, url, mime_type, storage, priority, source_type, availability)
       VALUES ($1, $2, 'other', 'direct_url', $3, $4, 'manual-url', 0, 'remote', 'available')`,
      [uuid(), trackId, audioUrl, guessAudioMime(audioUrl)],
    );
  }
  if (externalUrl) {
    await db.query(
      `INSERT INTO track_sources
         (id, track_id, provider, kind, url, storage, priority, source_type, availability)
       VALUES ($1, $2, $3, 'external_link', $4, 'external', 10, 'external', 'available')`,
      [uuid(), trackId, externalProviderFor(externalUrl), externalUrl],
    );
  }
}

/** Current media URLs of a track, for the admin editor. */
export async function readTrackSources(trackId: string) {
  const db = await getDb();
  const rows = await db.query<{ kind: string; url: string; mime_type: string | null }>(
    `SELECT kind, url, mime_type FROM track_sources WHERE track_id = $1 ORDER BY priority`,
    [trackId],
  );
  return {
    audioUrl: rows.find((s) => s.kind === 'direct_url')?.url ?? null,
    externalUrl: rows.find((s) => s.kind === 'external_link' || s.kind === 'embed')?.url ?? null,
    mimeType: rows.find((s) => s.kind === 'direct_url')?.mime_type ?? null,
  };
}
