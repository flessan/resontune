import { ApiError, database, json, session, type PagesContext } from '../../_shared';

async function requireModerator(c: PagesContext) {
  const u = await session(c, true);
  if (u!.effectiveRole !== 'moderator' && u!.effectiveRole !== 'admin') {
    throw new ApiError(403, 'Moderator access required.');
  }
}

export const onRequestGet = async (c: PagesContext) => {
  await requireModerator(c);
  const sql = await database(c.env);
  const rows: any[] = await sql.query(
    `SELECT td.id, td.entity_kind, td.entity_id, td.reason, td.requested_by, td.created_at,
            u.handle AS actor_handle, t.title AS track_title, t.slug AS track_slug
       FROM takedowns td
       LEFT JOIN users u ON u.id=td.actor_id
       LEFT JOIN tracks t ON td.entity_kind='track' AND t.id=td.entity_id
      ORDER BY td.created_at DESC LIMIT 100`,
  );

  return json({
    takedowns: rows.map((e) => ({
      id: e.id,
      entityKind: e.entity_kind,
      entityId: e.entity_id,
      reason: e.reason,
      requestedBy: e.requested_by,
      createdAt: e.created_at,
      actorHandle: e.actor_handle,
      trackTitle: e.track_title,
      trackSlug: e.track_slug,
    })),
  });
};

export const onRequest = (c: PagesContext) => {
  if (c.request.method === 'GET') return onRequestGet(c);
  return json({ error: 'Method not allowed.' }, 405);
};
