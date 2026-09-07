import { database, env, json, type PagesContext } from '../../_shared';

const TRACK_SQL = `t.id,t.slug,t.title,t.track_no,t.duration_seconds,t.artwork_url,t.description,t.rights_holder,t.credits,t.play_count,t.like_count,t.created_at,t.source_type,t.attribution_text,t.territory,a.id artist_id,a.slug artist_slug,a.name artist_name,al.id album_id,al.slug album_slug,al.title album_title,al.artwork_url album_artwork,l.id license_id,l.name license_name,l.url license_url,l.requires_attribution license_attribution`;

function track(row: any, extras: { genres?: any[]; tags?: any[]; sources?: any[]; lyrics?: any; } = {}) {
  return {
    id: row.id, slug: row.slug, title: row.title, trackNo: row.track_no, duration: row.duration_seconds,
    artworkUrl: row.artwork_url ?? row.album_artwork, description: row.description,
    rightsHolder: row.rights_holder, credits: row.credits, playCount: Number(row.play_count ?? 0),
    likeCount: Number(row.like_count ?? 0), createdAt: row.created_at, sourceType: row.source_type,
    attributionText: row.attribution_text, territory: row.territory,
    artist: { id: row.artist_id, slug: row.artist_slug, name: row.artist_name },
    album: row.album_id ? { id: row.album_id, slug: row.album_slug, title: row.album_title, artworkUrl: row.album_artwork } : null,
    license: row.license_id ? { id: row.license_id, name: row.license_name, url: row.license_url, requiresAttribution: row.license_attribution } : null,
    sources: extras.sources ?? [], genres: extras.genres ?? [], tags: extras.tags ?? [],
    lyrics: extras.lyrics ?? null,
  };
}

async function query(c: PagesContext, where: string, args: unknown[], order = 't.play_count DESC', limit = 6) {
  const sql = await database(c.env);
  const rows = await sql.query(`SELECT ${TRACK_SQL} FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id LEFT JOIN licenses l ON l.id=t.license_id WHERE t.status='published' AND a.status IN ('published','unlisted') AND (t.album_id IS NULL OR al.status IN ('published','unlisted')) ${where} ORDER BY ${order} LIMIT ${limit}`, args);
  return (rows as any[]).map((r) => track(r));
}

export const onRequestGet = async (c: PagesContext) => {
  const slug = c.params.slug;
  if (!slug) return json({ error: 'Track not found.' }, 404);
  const sql = await database(c.env);
  const rows: any[] = await sql.query(`SELECT ${TRACK_SQL} FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id LEFT JOIN licenses l ON l.id=t.license_id WHERE t.slug=$1 AND t.status='published' AND a.status IN ('published','unlisted') AND (t.album_id IS NULL OR al.status IN ('published','unlisted')) LIMIT 1`, [slug]);
  const row = rows[0];
  if (!row) return json({ error: 'Track not found.' }, 404);

  const [genres, tags, sources, lyrics, related, moreFromArtist] = await Promise.all([
    sql.query(`SELECT g.id,g.name FROM track_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.track_id=$1 ORDER BY g.name`, [row.id]),
    sql.query(`SELECT tg.id,tg.name FROM track_tags tt JOIN tags tg ON tg.id=tt.tag_id WHERE tt.track_id=$1 ORDER BY tg.name`, [row.id]),
    sql.query(`SELECT provider,kind,mime_type,source_type,availability,priority FROM track_sources WHERE track_id=$1 ORDER BY priority`, [row.id]),
    sql.query(`SELECT body,kind FROM lyrics WHERE track_id=$1 LIMIT 1`, [row.id]),
    query(c, 'AND t.id <> $1 AND t.artist_id <> $2 AND t.id IN (SELECT track_id FROM track_genres WHERE genre_id IN (SELECT genre_id FROM track_genres WHERE track_id=$1))', [row.id, row.artist_id]),
    query(c, 'AND t.artist_id=$1 AND t.id<>$2', [row.artist_id, row.id]),
  ]);

  return json({
    track: track(row, {
      genres: (genres as any[]).map((g) => ({ id: g.id, name: g.name })),
      tags: (tags as any[]).map((t) => ({ id: t.id, name: t.name })),
      sources: (sources as any[]).map((s) => ({ provider: s.provider, kind: s.kind, mimeType: s.mime_type, sourceType: s.source_type, availability: s.availability })),
      lyrics: (lyrics as any[])[0] ?? null,
    }),
    related,
    moreFromArtist,
  });
};
