import { ApiError, body, database, json, session, type PagesContext } from '../../../_shared';

const UUID_RE = /^[0-9a-f-]{36}$/;
const STATES = ['published', 'unlisted', 'taken_down', 'archived'] as const;

export const onRequestPost = async (c: PagesContext) => {
  const u = await session(c, true);
  if (u!.effectiveRole !== 'moderator' && u!.effectiveRole !== 'admin') {
    throw new ApiError(403, 'Moderator access required.');
  }

  const id = c.params.id;
  if (!id || !UUID_RE.test(id)) throw new ApiError(400, 'Bad track id.');

  const b = await body(c.request);
  const status = typeof b.status === 'string' ? b.status : '';
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!STATES.includes(status as (typeof STATES)[number]) || reason.length < 3 || reason.length > 600) {
    throw new ApiError(400, 'Invalid state change.');
  }

  const sql = await database(c.env);
  const rows: any[] = await sql.query(`SELECT status FROM tracks WHERE id=$1`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Track not found.');

  const previous = rows[0].status;
  await sql.query(`UPDATE tracks SET status=$2 WHERE id=$1`, [id, status]);
  await sql.query(
    `INSERT INTO takedowns (id, entity_kind, entity_id, reason, requested_by, actor_id)
     VALUES ($1, 'track', $2, $3, $4, $5)`,
    [crypto.randomUUID(), id, `${previous} → ${status}: ${reason}`, null, u.id],
  );

  return json({ ok: true, status });
};

export const onRequest = (c: PagesContext) => {
  if (c.request.method === 'POST') return onRequestPost(c);
  return json({ error: 'Method not allowed.' }, 405);
};
