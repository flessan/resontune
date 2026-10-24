import { neon } from '@neondatabase/serverless';
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  DATABASE_URL?: string;
  NEON_AUTH_URL?: string;
  NEON_AUTH_JWKS_URL?: string;
  NEON_AUTH_JWKS_JSON?: string;
  ADMIN_USER_IDS?: string;
  MODERATOR_USER_IDS?: string;
  AUDIO_CDN_BASE?: string;
  IMGBB_API_KEY?: string;
  [key: string]: unknown;
}
export interface PagesContext { request: Request; env: Env; params: Record<string, string | undefined>; }
export type Handler = (context: PagesContext) => Response | Promise<Response>;

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const json = (body: unknown, status = 200, headers: HeadersInit = {}) => {
  const h = new Headers(headers); h.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
};
export const fail = (status: number, message: string) => json({ error: message }, status);
export const env = (context: PagesContext, key: string) => String(context.env[key] ?? '');

let jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet> | undefined;
function keySet(e: Env, url: string) {
  if (!jwks) {
    if (e.NEON_AUTH_JWKS_JSON) jwks = createLocalJWKSet(JSON.parse(e.NEON_AUTH_JWKS_JSON));
    else jwks = createRemoteJWKSet(new URL(e.NEON_AUTH_JWKS_URL || `${url}/.well-known/jwks.json`));
  }
  return jwks;
}
export interface Identity { subject: string; name: string | null; email: string | null; image: string | null; }
export async function verifyBearer(request: Request, e: Env): Promise<Identity | null> {
  const value = request.headers.get('authorization');
  const base = (e.NEON_AUTH_URL || '').replace(/\/+$/, '');
  if (!value?.startsWith('Bearer ') || !base) return null;
  try {
    const { payload } = await jwtVerify(value.slice(7), keySet(e, base), {
      issuer: new URL(base).origin, algorithms: ['EdDSA'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return { subject: payload.sub, name: typeof payload.name === 'string' ? payload.name : null, email: typeof payload.email === 'string' ? payload.email : null, image: typeof payload.picture === 'string' ? payload.picture : typeof payload.image === 'string' ? payload.image : null };
  } catch { return null; }
}
export async function database(e: Env) {
  if (!e.DATABASE_URL) throw new ApiError(503, 'Database is not configured.');
  return neon(e.DATABASE_URL);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  try { const value = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { throw new ApiError(400, 'Invalid JSON body.'); }
}
export function roleFor(id: string, stored: string, e: Env) {
  const admins = (e.ADMIN_USER_IDS || '').split(',').map(x => x.trim());
  const mods = (e.MODERATOR_USER_IDS || '').split(',').map(x => x.trim());
  if (admins.includes(id)) return 'admin'; if (mods.includes(id) && stored !== 'admin') return 'moderator'; return stored;
}
export async function session(context: PagesContext, required = false) {
  const identity = await verifyBearer(context.request, context.env);
  if (!identity) { if (required) throw new ApiError(401, 'Authentication required.'); return null; }
  const sql = await database(context.env);
  const rows = await sql.query(`SELECT id, handle, display_name, avatar_url, avatar_thumb_url, bio, location, website_url, role, created_at FROM users WHERE auth_provider='neon' AND auth_subject=$1`, [identity.subject]);
  let u: any = rows[0];
  if (!u) {
    const deleted = await sql.query(`SELECT 1 FROM deleted_identities WHERE auth_provider='neon' AND auth_subject=$1 AND expires_at > now()`, [identity.subject]);
    if (deleted[0]) { if (required) throw new ApiError(401, 'This account no longer exists. Sign in again to continue.'); return null; }
    const seed = (identity.name || identity.email?.split('@')[0] || 'listener').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'listener';
    const handle = `${seed}-${crypto.randomUUID().slice(0, 6)}`;
    const inserted = await sql.query(`INSERT INTO users(id,handle,display_name,avatar_url,auth_provider,auth_subject) VALUES($1,$2,$3,$4,'neon',$5) ON CONFLICT (auth_provider,auth_subject) DO NOTHING RETURNING id,handle,display_name,avatar_url,avatar_thumb_url,bio,location,website_url,role,created_at`, [crypto.randomUUID(), handle, identity.name || seed, identity.image, identity.subject]);
    u = inserted[0] || (await sql.query(`SELECT id,handle,display_name,avatar_url,avatar_thumb_url,bio,location,website_url,role,created_at FROM users WHERE auth_provider='neon' AND auth_subject=$1`, [identity.subject]))[0];
  }
  if (!u) { if (required) throw new ApiError(401, 'Account not found.'); return null; }
  return { ...u, effectiveRole: roleFor(String(u.id), String(u.role), context.env), identity };
}
export function publicUser(u: any) { return { id: u.id, handle: u.handle, displayName: u.display_name, avatarUrl: u.avatar_url, avatarThumbUrl: u.avatar_thumb_url, bio: u.bio, location: u.location, websiteUrl: u.website_url, role: u.effectiveRole ?? u.role, createdAt: u.created_at }; }
export function pathParts(request: Request) { return new URL(request.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean); }
export function pagination(request: Request, max = 60) { const q = new URL(request.url).searchParams; const limit = Math.min(max, Math.max(1, Number(q.get('limit')) || 24)); const offset = Math.min(10000, Math.max(0, Number(q.get('offset')) || 0)); return { limit, offset, q }; }
export async function run(context: PagesContext, fn: () => Promise<Response>) { try { return await fn(); } catch (error) { if (error instanceof ApiError) return fail(error.status, error.message); console.error('[pages-api]', error instanceof Error ? error.message : 'unexpected error'); return fail(500, 'Something went wrong.'); } }
