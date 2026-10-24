import { json, type Handler } from '../_shared';

export const onRequest: Handler = ({ request }) => request.method === 'GET' ? json({ ok: true, name: 'resontune' }) : json({ error: 'Method not allowed.' }, 405);
