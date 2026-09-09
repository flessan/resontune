import { ApiError, body, database, json, pagination, run, session, type PagesContext } from '../../_shared';

const STATUSES = ['published', 'unlisted', 'taken_down', 'archived'] as const;
const SOURCE_TYPES = ['original', 'community', 'external'] as const;
const UUID_RE = /^[0-9a-f-]{36}$/;

function text(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new ApiError(400, 'Invalid text field.');
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}
function optionalBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function validUrl(value: unknown, label: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, `${label} must be a URL.`);
  let u: URL;
  try { u = new URL(value.trim()); } catch { throw new ApiError(400, `${label} must be a valid URL.`); }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\\.|10\\.|192\\.168\\.|169\\.254\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/i.test(u.hostname)) {
    throw new ApiError(400, `${label} must be a public https URL.`);
  }
  return u.toString();
}
function uuid(value: unknown, label: string, nullable = false): string | null {
  if (value == null || value === '') {
    if (nullable) return null;
    throw new ApiError(400, `${label} is required.`);
  }
  const v = String(value);
  if (!UUID_RE.test(v)) throw new ApiError(400, `Bad ${label}.`);
  return v;
}
function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'track';
}
async function uniqueSlug(sql: any, desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired);
  for (let i = 0; i < 40; i += 1) {
    const candidate = i ? `${base}-${i + 1}` : base;
    const rows = await sql.query(`SELECT 1 FROM tracks WHERE slug=$1 ${excludeId ? 'AND id<>$2' : ''}`, excludeId ? [candidate, excludeId] : [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}
function providerForExternal(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com') return 'youtube';
  if (host.endsWith('.soundcloud.com') || host === 'soundcloud.com') return 'soundcloud';
  return 'other';
}
function mimeForAudio(url: string): string | null {
  const path = new URL(url).pathname.toLowerCase();
  const map: Record<string, string> = { '.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.oga':'audio/ogg','.opus':'audio/ogg','.wav':'audio/wav','.flac':'audio/flac','.webm':'audio/webm' };
  for (const [ext, mime] of Object.entries(map)) if (path.endsWith(ext)) return mime;
  return null;
}
async function assertArtist(sql: any, id: string): Promise<void> {
  if (!(await sql.query(`SELECT 1 FROM artists WHERE id=$1`, [id]))[0]) throw new ApiError(400, 'Choose an existing artist.');
}
async function assertRelease(sql: any, id: string | null): Promise<void> {
  if (id && !(await sql.query(`SELECT 1 FROM albums WHERE id=$1`, [id]))[0]) throw new ApiError(400, 'Choose an existing release.');
}
async function assertLicense(sql: any, id: string | null): Promise<void> {
  if (id && !(await sql.query(`SELECT 1 FROM licenses WHERE id=$1`, [id]))[0]) throw new ApiError(400, 'Unknown license.');
}
async function syncGenres(sql: any, trackId: string, genres: unknown): Promise<void> {
  if (!Array.isArray(genres)) return;
  await sql.query(`DELETE FROM track_genres WHERE track_id=$1`, [trackId]);
  const seen = new Set<string>();
  for (const raw of genres.slice(0, 8)) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().slice(0, 40);
    if (!name) continue;
    const id = slugify(name).slice(0, 40);
    if (seen.has(id)) continue;
    seen.add(id);
    await sql.query(`INSERT INTO genres(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING`, [id, name]);
    await sql.query(`INSERT INTO track_genres(track_id,genre_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [trackId, id]);
  }
}
async function syncLinks(sql: any, trackId: string, links: unknown): Promise<void> {
  if (!Array.isArray(links)) return;
  await sql.query(`DELETE FROM entity_links WHERE entity_kind='track' AND entity_id=$1`, [trackId]);
  let position = 0;
  for (const raw of links.slice(0, 12)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const url = validUrl(item.url, 'Link');
    if (!url) continue;
    const provider = text(item.provider, 30) || providerForExternal(url);
    const label = text(item.label, 40) || provider;
    await sql.query(`INSERT INTO entity_links(id,entity_kind,entity_id,provider,label,url,position) VALUES($1,'track',$2,$3,$4,$5,$6)`, [crypto.randomUUID(), trackId, provider, label, url, position++]);
  }
}
async function syncSources(sql: any, trackId: string, audioUrl: string | null, externalUrl: string | null): Promise<void> {
  await sql.query(`DELETE FROM track_sources WHERE track_id=$1`, [trackId]);
  if (audioUrl) await sql.query(`INSERT INTO track_sources(id,track_id,provider,kind,url,mime_type,storage,priority,source_type,availability) VALUES($1,$2,'other','direct_url',$3,$4,'manual-url',0,'remote','available')`, [crypto.randomUUID(), trackId, audioUrl, mimeForAudio(audioUrl)]);
  if (externalUrl) await sql.query(`INSERT INTO track_sources(id,track_id,provider,kind,url,storage,priority,source_type,availability) VALUES($1,$2,$3,'external_link',$4,'external',10,'external','available')`, [crypto.randomUUID(), trackId, providerForExternal(externalUrl), externalUrl]);
}
async function readTrack(sql: any, id: string): Promise<any> {
  const rows = await sql.query(`SELECT t.*,a.name artist_name,a.slug artist_slug,al.title album_title,al.slug album_slug,al.artwork_url album_artwork,l.name license_name FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id LEFT JOIN licenses l ON l.id=t.license_id WHERE t.id=$1`, [id]);
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Track not found.');
  const [sources, genres, links] = await Promise.all([
    sql.query(`SELECT kind,url,mime_type FROM track_sources WHERE track_id=$1 ORDER BY priority`, [id]),
    sql.query(`SELECT g.id,g.name FROM track_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.track_id=$1 ORDER BY g.name`, [id]),
    sql.query(`SELECT provider,label,url FROM entity_links WHERE entity_kind='track' AND entity_id=$1 ORDER BY position`, [id]),
  ]);
  const direct = (sources as any[]).find((s) => s.kind === 'direct_url');
  const external = (sources as any[]).find((s) => s.kind !== 'direct_url');
  return { track: {
    id: row.id, slug: row.slug, title: row.title, status: row.status, sourceType: row.source_type,
    trackNo: row.track_no, duration: row.duration_seconds, description: row.description ?? null,
    artworkUrl: row.artwork_url ?? null, inheritedArtworkUrl: row.album_artwork ?? null,
    explicit: Boolean(row.explicit), licenseId: row.license_id ?? null, licenseName: row.license_name ?? null,
    rightsHolder: row.rights_holder ?? null, credits: row.credits ?? null,
    attributionText: row.attribution_text ?? null, territory: row.territory ?? 'worldwide', rightsNotes: row.rights_notes ?? null,
    streamingPermission: row.streaming_permission ?? true, distributionPermission: row.distribution_permission ?? false,
    artistId: row.artist_id, artist: { id: row.artist_id, name: row.artist_name, slug: row.artist_slug },
    releaseId: row.album_id ?? null, release: row.album_id ? { id: row.album_id, title: row.album_title, slug: row.album_slug } : null,
    playCount: Number(row.play_count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at,
    audioUrl: direct?.url ?? null, externalUrl: external?.url ?? null, mimeType: direct?.mime_type ?? null,
    genres, links,
  }};
}
async function ensureAdmin(c: PagesContext): Promise<any> {
  const u = await session(c, true);
  if (u!.effectiveRole !== 'admin') throw new ApiError(403, 'Administrator access required.');
  return u;
}

export const onRequest = (c: PagesContext) => run(c, async () => {
  const u = await ensureAdmin(c);
  const sql = await database(c.env);
  if (c.request.method === 'GET') {
    const { limit, offset, q } = pagination(c.request, 100);
    const term = q.get('q')?.trim().slice(0, 60) || '';
    const rows: any[] = await sql.query(`SELECT t.*,a.name artist_name,a.slug artist_slug,al.title album_title,al.slug album_slug,al.artwork_url album_artwork,l.name license_name FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id LEFT JOIN licenses l ON l.id=t.license_id WHERE ($1='' OR lower(t.title) LIKE $2 OR lower(a.name) LIKE $2) ORDER BY t.updated_at DESC LIMIT $3 OFFSET $4`, [term.toLowerCase(), `%${term.toLowerCase().replace(/[%_]/g,'')}%`, limit, offset]);
    const tracks = [];
    for (const row of rows) tracks.push((await readTrack(sql, row.id)).track);
    return json({ tracks, limit, offset });
  }
  if (c.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const b = await body(c.request);
  const title = text(b.title, 160); if (!title) throw new ApiError(400, 'Title is required.');
  const artistId = uuid(b.artistId, 'artist id')!; await assertArtist(sql, artistId);
  const releaseId = uuid(b.releaseId, 'release id', true); await assertRelease(sql, releaseId);
  const licenseId = text(b.licenseId, 40); await assertLicense(sql, licenseId);
  const audioUrl = validUrl(b.audioUrl, 'Audio URL');
  const artworkUrl = validUrl(b.artworkUrl, 'Artwork URL');
  const externalUrl = validUrl(b.externalUrl, 'External URL');
  const status = typeof b.status === 'string' && STATUSES.includes(b.status as any) ? b.status : 'published';
  const sourceType = typeof b.sourceType === 'string' && SOURCE_TYPES.includes(b.sourceType as any) ? b.sourceType : 'community';
  const duration = b.duration == null ? null : Number(b.duration);
  if (duration != null && (!Number.isInteger(duration) || duration < 0 || duration > 86400)) throw new ApiError(400, 'Duration must be a whole number of seconds.');
  const trackNo = b.trackNo == null ? null : Number(b.trackNo);
  if (trackNo != null && (!Number.isInteger(trackNo) || trackNo < 0 || trackNo > 999)) throw new ApiError(400, 'Track number is invalid.');
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(sql, String(b.slug || title));
  await sql.query(`INSERT INTO tracks(id,slug,title,artist_id,album_id,track_no,duration_seconds,artwork_url,description,license_id,rights_holder,credits,explicit,status,source_type,attribution_text,territory,rights_notes,streaming_permission,distribution_permission,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())`, [id,slug,title,artistId,releaseId,trackNo,duration,artworkUrl,text(b.description,2000),licenseId,text(b.rightsHolder,160),text(b.credits,600),optionalBool(b.explicit,false),status,sourceType,text(b.attributionText,300),text(b.territory,60) || 'worldwide',text(b.rightsNotes,600),optionalBool(b.streamingPermission,true),optionalBool(b.distributionPermission,false)]);
  await syncSources(sql, id, audioUrl, externalUrl); await syncGenres(sql,id,b.genres); await syncLinks(sql,id,b.links);
  if (releaseId) await sql.query(`UPDATE albums SET updated_at=now() WHERE id=$1`, [releaseId]);
  return json(await readTrack(sql, id), 201);
});
