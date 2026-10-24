import { database, json, type PagesContext } from '../../_shared';

function publicTrack(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    trackNo: row.track_no,
    duration: row.duration_seconds,
    artworkUrl: row.artwork_url ?? row.album_artwork,
    description: row.description,
    rightsHolder: row.rights_holder,
    credits: row.credits,
    playCount: Number(row.play_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    createdAt: row.created_at,
    sourceType: row.source_type,
    attributionText: row.attribution_text,
    territory: row.territory,
    artist: { id: row.artist_id, slug: row.artist_slug, name: row.artist_name },
    album: row.album_id ? { id: row.album_id, slug: row.album_slug, title: row.album_title, artworkUrl: row.album_artwork } : null,
    license: null,
    sources: [],
    genres: [],
    tags: [],
  };
}

export const onRequestGet = async (c: PagesContext) => {
  const auth = c.request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);
  const { verifyBearer } = await import('../../_shared');
  const identity = await verifyBearer(c.request, c.env);
  if (!identity) return json({ error: 'Authentication required.' }, 401);

  const sql = await database(c.env);
  const users: any[] = await sql.query(`SELECT id FROM users WHERE auth_provider='neon' AND auth_subject=$1 LIMIT 1`, [identity.subject]);
  if (!users[0]) return json({ history: [] });

  const rows: any[] = await sql.query(`
    SELECT ph.played_at,t.id,t.slug,t.title,t.track_no,t.duration_seconds,t.artwork_url,t.description,
           t.rights_holder,t.credits,t.play_count,t.like_count,t.created_at,t.source_type,t.attribution_text,t.territory,
           a.id artist_id,a.slug artist_slug,a.name artist_name,
           al.id album_id,al.slug album_slug,al.title album_title,al.artwork_url album_artwork
      FROM play_history ph
      JOIN tracks t ON t.id=ph.track_id
      JOIN artists a ON a.id=t.artist_id
      LEFT JOIN albums al ON al.id=t.album_id
     WHERE ph.user_id=$1
     ORDER BY ph.played_at DESC
     LIMIT 100
  `, [users[0].id]);

  return json({
    history: rows.map((r) => ({ playedAt: r.played_at, track: publicTrack(r) })),
  });
};
