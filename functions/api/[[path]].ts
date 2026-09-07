import { createRemoteJWKSet, jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';

type Env = {
  DATABASE_URL: string;
  NEON_AUTH_URL?: string;
  NEON_AUTH_JWKS_URL?: string;
};

type User = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  role: 'listener' | 'moderator' | 'admin';
  created_at: string;
};

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function authConfig(env: Env) {
  const url = (env.NEON_AUTH_URL ?? '').replace(/\/+$/, '');
  const jwks = env.NEON_AUTH_JWKS_URL ?? (url ? `${url}/.well-known/jwks.json` : '');
  return { url, jwks };
}

async function authenticatedUser(request: Request, env: Env): Promise<User | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ') || !env.DATABASE_URL) return null;

  const { url, jwks } = authConfig(env);
  if (!url || !jwks) return null;

  try {
    const { payload } = await jwtVerify(
      header.slice(7),
      createRemoteJWKSet(new URL(jwks)),
      { issuer: new URL(url).origin, algorithms: ['EdDSA'] },
    );
    if (!payload.sub) return null;

    const sql = neon(env.DATABASE_URL);
    const rows = await sql<User[]>`
      SELECT id, handle, display_name, avatar_url, avatar_thumb_url,
             bio, location, website_url, role, created_at
      FROM users
      WHERE auth_provider = 'neon' AND auth_subject = ${payload.sub}
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = Array.isArray(params.path) ? `/${params.path.join('/')}` : `/${params.path ?? ''}`;
  const method = request.method.toUpperCase();

  if (path === '/health' && (method === 'GET' || method === 'HEAD')) {
    return json({ ok: true, name: 'resontune', runtime: 'cloudflare-pages-functions' });
  }

  if (path === '/auth/me' && (method === 'GET' || method === 'HEAD')) {
    const { url } = authConfig(env);
    const user = await authenticatedUser(request, env);
    return json({
      user: user
        ? {
            id: user.id,
            handle: user.handle,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            avatarThumbUrl: user.avatar_thumb_url,
            bio: user.bio,
            location: user.location,
            websiteUrl: user.website_url,
            role: user.role,
            createdAt: user.created_at,
          }
        : null,
      auth: { configured: Boolean(url), url: url || null },
    });
  }

  return json({ error: 'Not found.' }, 404);
};
