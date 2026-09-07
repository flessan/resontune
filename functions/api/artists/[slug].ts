import { ApiError, database, env, json, session, type PagesContext } from '../../_shared';

const TRACK_SQL = `
  t.id,t.slug,t.title,t.track_no,t.duration_seconds,t.artwork_url,t.description,
  t.rights_holder,t.credits,t.play_count,t.like_count,t.created_at,t.source_type,
  t.attribution_text,t.territory,
  a.id artist_id,a.slug artist_slug,a.name artist_name,
  al.id album_id,al.slug album_slug,al.title album_title,al.artwork_url album_artwork
`;

function track(row: any) {
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
    album: row.album_id
      ? {
          id: row.album_id,
          slug: row.album_slug,
          title: row.album_title,
          artworkUrl: row.album_artwork,
        }
      : null,
  };
}

async function publishedTracks(c: PagesContext, artistId: string) {
  const sql = await database(c.env);
  const rows = await sql.query(
    `SELECT ${TRACK_SQL}
       FROM tracks t
       JOIN artists a ON a.id=t.artist_id
       LEFT JOIN albums al ON al.id=t.album_id
      WHERE t.status='published'
        AND a.status IN ('published','unlisted')
        AND (t.album_id IS NULL OR al.status IN ('published','unlisted'))
        AND t.artist_id=$1
      ORDER BY t.play_count DESC, t.created_at DESC
      LIMIT 100`,
    [artistId],
  );
  return (rows as any[]).map(track);
}

export async function onRequestGet(c: PagesContext) {
  const slug = c.params.slug;
  if (typeof slug !== 'string' || !slug) throw new ApiError(400, 'Artist slug is required.');

  const sql = await database(c.env);
  const rows: any[] = await sql.query(
    `SELECT id,slug,name,bio,image_url,location,source_type,created_at
       FROM artists
      WHERE slug=$1 AND status IN ('published','unlisted')`,
    [slug],
  );
  if (!rows[0]) throw new ApiError(404, 'Artist not found.');

  const artistRow = rows[0];
  const [linksRaw, genresRaw, albumsRaw, popularTracks] = await Promise.all([
    sql.query(
      `SELECT provider,label,url
         FROM entity_links
        WHERE entity_kind='artist' AND entity_id=$1
        ORDER BY position`,
      [artistRow.id],
    ),
    sql.query(
      `SELECT DISTINCT g.id,g.name
         FROM track_genres tg
         JOIN genres g ON g.id=tg.genre_id
         JOIN tracks t ON t.id=tg.track_id
        WHERE t.artist_id=$1 AND t.status='published'
        ORDER BY g.name`,
      [artistRow.id],
    ),
    sql.query(
      `SELECT id,slug,title,type,artwork_url,released_on,description,source_type,catalog_no,
              (SELECT count(*) FROM tracks tr WHERE tr.album_id=albums.id AND tr.status='published') track_count
         FROM albums
        WHERE artist_id=$1 AND status='published'
        ORDER BY released_on DESC NULLS LAST, created_at DESC`,
      [artistRow.id],
    ),
    publishedTracks(c, artistRow.id),
  ]);

  const links = (linksRaw as any[]).filter((link) => {
    try {
      return new URL(String(link.url)).protocol === 'https:';
    } catch {
      return false;
    }
  });

  const genres = (genresRaw as any[]).map((g) => ({ id: g.id, name: g.name }));
  const albums = (albumsRaw as any[]).map((al) => ({
    id: al.id,
    slug: al.slug,
    title: al.title,
    type: al.type,
    artworkUrl: al.artwork_url ?? null,
    releasedOn: al.released_on,
    description: al.description ?? null,
    sourceType: al.source_type,
    catalogNo: al.catalog_no ?? null,
    trackCount: Number(al.track_count ?? 0),
  }));

  return json({
    artist: {
      id: artistRow.id,
      slug: artistRow.slug,
      name: artistRow.name,
      bio: artistRow.bio ?? null,
      imageUrl: artistRow.image_url ?? null,
      location: artistRow.location ?? null,
      sourceType: artistRow.source_type,
      createdAt: artistRow.created_at,
      links,
      genres,
    },
    albums,
    // ArtistPage expects this exact field name. Keep `tracks` as a compatibility alias.
    popularTracks,
    tracks: popularTracks,
  });
}
