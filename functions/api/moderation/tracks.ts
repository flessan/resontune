import { ApiError, body, database, json, session, type PagesContext } from '../../_shared';

const UUID_RE = /^[0-9a-f-]{36}$/;
const STATES = ['published', 'unlisted', 'taken_down', 'archived'] as const;

async function requireModerator(c: PagesContext) {
  const u = await session(c, true);
  if (u!.effectiveRole !== 'moderator' && u!.effectiveRole !== 'admin') {
    throw new ApiError(403, 'Moderator access required.');
  }
  return u!;
}

export const onRequestGet = async (c: PagesContext) => {
  const u = await requireModerator(c);
  void u;
  const status = new URL(c.request.url).searchParams.get('status');
  const sql = await database(c.env);
  const args: unknown[] = [];
  let where = '';
  if (status && STATES.includes(status as (typeof STATES)[number])) {
    where = 'WHERE t.status = $1';
    args.push(status);
  }
  const rows: any[] = await sql.query(
    `SELECT t.id, t.slug, t.title, t.status, t.source_type, t.created_at,
            a.name AS artist_name, a.slug AS artist_slug
       FROM tracks t JOIN artists a ON a.id=t.artist_id
      ${where}
      ORDER BY t.created_at DESC LIMIT 100`,
    args,
  );

  return json({
    tracks: rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      status: t.status,
      sourceType: t.source_type,
      createdAt: t.created_at,
      artist: {
        name: t.artist_name,
        slug: t.artist_slug,
      },
    })),
  });
};

export const onRequestPost = async (c: PagesContext) => {
  const u = await requireModerator(c);
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

  await sql.query(`UPDATE tracks SET status=$2 WHERE id=$1`, [id, status]);
  await sql.query(
    `INSERT INTO takedowns (id, entity_kind, entity_id, reason, requested_by, actor_id)
     VALUES ($1, 'track', $2, $3, $4, $5)`,
    [crypto.randomUUID(), id, `${rows[0].status} → ${status}: ${reason}`, null, u.id],
  );

  return json({ ok: true, status });
};

export const onRequest = async (c: PagesContext) => {
  if (c.request.method === 'GET') return onRequestGet(c);
  if (c.request.method === 'POST') return onRequestPost(c);
  return json({ error: 'Method not allowed.' }, 405);
};
