import { database, json, type PagesContext } from '../_shared';

const TRACK_SQL = `t.id,t.slug,t.title,t.track_no,t.duration_seconds,t.artwork_url,t.description,t.rights_holder,t.credits,t.play_count,t.like_count,t.created_at,t.source_type,t.attribution_text,t.territory,a.id artist_id,a.slug artist_slug,a.name artist_name,al.id album_id,al.slug album_slug,al.title album_title,al.artwork_url album_artwork`;

function serializeTrack(row: any) {
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
      ? { id: row.album_id, slug: row.album_slug, title: row.album_title, artworkUrl: row.album_artwork }
      : null,
  };
}

async function queryTracks(c: PagesContext, where = '', args: unknown[] = [], order = 't.created_at DESC', limit = 24) {
  const sql = await database(c.env);
  const rows = await sql.query(
    `SELECT ${TRACK_SQL}
       FROM tracks t
       JOIN artists a ON a.id=t.artist_id
       LEFT JOIN albums al ON al.id=t.album_id
      WHERE t.status='published'
        AND a.status IN ('published','unlisted')
        AND (t.album_id IS NULL OR al.status IN ('published','unlisted'))
        ${where}
      ORDER BY ${order}
      LIMIT $${args.length + 1}`,
    [...args, limit],
  );
  return (rows as any[]).map(serializeTrack);
}

async function home(c: PagesContext) {
  const sql = await database(c.env);
  const [trendingInitial, newReleaseRows, originals, risingRows, picksRows, featuredRows, collectionRows] = await Promise.all([
    queryTracks(c, `AND t.id IN (
      SELECT track_id FROM play_events
      WHERE played_at > now() - interval '14 days'
      GROUP BY track_id ORDER BY count(*) DESC LIMIT 12
    )`, [], 't.play_count DESC', 12),
    sql.query(`
      SELECT al.id,al.slug,al.title,al.type,al.artwork_url,al.released_on,al.source_type,
             a.name artist_name,a.slug artist_slug,
             (SELECT count(*) FROM tracks tr WHERE tr.album_id=al.id AND tr.status='published') track_count
        FROM albums al JOIN artists a ON a.id=al.artist_id AND a.status IN ('published','unlisted')
       WHERE al.status='published'
       ORDER BY al.released_on DESC NULLS LAST LIMIT 8
    `),
    queryTracks(c, `AND t.source_type='original'`, [], 't.play_count DESC', 8),
    sql.query(`
      SELECT a.id,a.slug,a.name,a.image_url,a.location,
             COALESCE(sum(t.play_count),0) plays,count(t.id) track_count
        FROM artists a
        LEFT JOIN tracks t ON t.artist_id=a.id AND t.status='published'
       WHERE a.status='published'
       GROUP BY a.id
       ORDER BY (COALESCE(sum(t.play_count),0)+1)::float/(count(t.id)+2) DESC,a.created_at DESC
       LIMIT 6
    `),
    sql.query(`SELECT track_id,note FROM community_picks ORDER BY created_at DESC LIMIT 8`),
    sql.query(`
      SELECT al.id,al.slug,al.title,al.type,al.artwork_url,al.released_on,
             al.description,al.catalog_no,a.name artist_name,a.slug artist_slug,
             (SELECT count(*) FROM tracks tr WHERE tr.album_id=al.id AND tr.status='published') track_count
        FROM albums al JOIN artists a ON a.id=al.artist_id AND a.status IN ('published','unlisted')
       WHERE al.source_type='original' AND al.status='published'
       ORDER BY al.released_on DESC NULLS LAST LIMIT 1
    `),
    sql.query(`
      SELECT c.id,c.slug,c.title,c.description,c.artwork_url,c.curator_name,
             (SELECT count(*) FROM collection_items ci WHERE ci.collection_id=c.id) item_count
        FROM collections c
       WHERE c.status='published'
       ORDER BY c.updated_at DESC LIMIT 6
    `),
  ]);

  const trending = trendingInitial.length
    ? trendingInitial
    : await queryTracks(c, '', [], 't.play_count DESC,t.created_at DESC', 12);

  const pickIds = (picksRows as any[]).map((p) => p.track_id);
  const picks = pickIds.length
    ? await queryTracks(c, 'AND t.id = ANY($1)', [pickIds], 't.created_at DESC', 24)
    : [];
  const pickById = new Map(picks.map((t: any) => [t.id, t]));
  const noteById = new Map((picksRows as any[]).map((p) => [p.track_id, p.note]));
  const communityPicks = pickIds
    .map((id) => pickById.get(id))
    .filter(Boolean)
    .map((t: any) => ({ ...t, pickNote: noteById.get(t.id) ?? null }));

  const feat: any = (featuredRows as any[])[0];
  return json({
    featuredRelease: feat
      ? {
          id: feat.id,
          slug: feat.slug,
          title: feat.title,
          type: feat.type,
          artworkUrl: feat.artwork_url,
          releasedOn: feat.released_on,
          description: feat.description,
          catalogNo: feat.catalog_no,
          trackCount: Number(feat.track_count ?? 0),
          sourceType: 'original',
          artist: { name: feat.artist_name, slug: feat.artist_slug },
        }
      : null,
    originals,
    collections: (collectionRows as any[]).map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      artworkUrl: c.artwork_url,
      curatorName: c.curator_name,
      itemCount: Number(c.item_count ?? 0),
    })),
    trending,
    newReleases: (newReleaseRows as any[]).map((al) => ({
      id: al.id,
      slug: al.slug,
      title: al.title,
      type: al.type,
      artworkUrl: al.artwork_url,
      releasedOn: al.released_on,
      trackCount: Number(al.track_count ?? 0),
      sourceType: al.source_type,
      artist: { name: al.artist_name, slug: al.artist_slug },
    })),
    risingArtists: (risingRows as any[]).map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      imageUrl: a.image_url,
      location: a.location,
      plays: Number(a.plays ?? 0),
      trackCount: Number(a.track_count ?? 0),
    })),
    communityPicks,
  });
}

export const onRequestGet = (context: PagesContext) => home(context);
