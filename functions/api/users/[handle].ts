import { database, json, type PagesContext, publicUser } from '../../_shared';

function safeHttpsLinks(rows: any[]) {
  return rows.filter((link) => {
    if (typeof link?.url !== 'string' || !link.url) return false;
    try {
      const url = new URL(link.url);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }).map((link) => ({
    provider: String(link.provider ?? 'other'),
    label: String(link.label ?? link.provider ?? 'Link'),
    url: link.url,
  }));
}

export const onRequestGet = async (c: PagesContext) => {
  const handle = c.params.handle;
  if (!handle) return json({ error: 'Profile not found.' }, 404);

  const sql = await database(c.env);
  const rows: any[] = await sql.query(
    `SELECT id,handle,display_name,avatar_url,avatar_thumb_url,bio,location,website_url,role,created_at
       FROM users WHERE lower(handle)=lower($1) LIMIT 1`,
    [handle],
  );
  const u = rows[0];
  if (!u) return json({ error: 'Profile not found.' }, 404);

  const [linkRows, playlists, artists, favorites] = await Promise.all([
    sql.query(`SELECT provider,label,url FROM entity_links WHERE entity_kind='user' AND entity_id=$1 ORDER BY position`, [u.id]),
    sql.query(`SELECT p.id,p.slug,p.title,p.description,p.like_count,p.updated_at,
                      (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) track_count
                 FROM playlists p WHERE p.owner_id=$1 AND p.is_public
                 ORDER BY p.updated_at DESC LIMIT 24`, [u.id]),
    sql.query(`SELECT a.id,a.slug,a.name,a.image_url,a.location,a.source_type,
                      (SELECT count(*) FROM tracks t WHERE t.artist_id=a.id AND t.status='published') track_count
                 FROM artists a WHERE a.user_id=$1 AND a.status IN ('published','unlisted')
                 ORDER BY a.created_at LIMIT 4`, [u.id]),
    sql.query(`SELECT count(*)::text n FROM favorites WHERE user_id=$1`, [u.id]),
  ]);

  const links = safeHttpsLinks(linkRows as any[]);
  const profile = {
    ...publicUser(u),
    username: u.handle,
    handle: u.handle,
    joinedAt: u.created_at,
    links,
    websiteUrl: typeof u.website_url === 'string' && /^https:\/\//i.test(u.website_url) ? u.website_url : null,
  };

  return json({
    profile,
    stats: {
      publicPlaylists: (playlists as any[]).length,
      favorites: Number((favorites as any[])[0]?.n || 0),
    },
    playlists: (playlists as any[]).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      likeCount: Number(p.like_count || 0),
      trackCount: Number(p.track_count || 0),
      isPublic: true,
      updatedAt: p.updated_at,
    })),
    artists: (artists as any[]).map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      imageUrl: a.image_url,
      location: a.location,
      sourceType: a.source_type,
      trackCount: Number(a.track_count || 0),
    })),
  });
};
