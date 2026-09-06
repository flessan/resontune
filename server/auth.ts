/**
 * Authentication.
 *
 * ResonTune never requires an account for listening. Accounts unlock cloud
 * features (synced playlists, favorites, history, submissions).
 *
 * Two real providers:
 *  - GitHub OAuth   — activated when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 *                     are configured (see .env.example). Standard
 *                     authorization-code flow, server-side only.
 *  - Dev sign-in    — local development fallback (no external service
 *                     needed). Explicitly disabled when GitHub OAuth is
 *                     configured unless ALLOW_DEV_LOGIN=true.
 *
 * Sessions are opaque random ids stored server-side (sessions table) and
 * delivered as an httpOnly cookie. No JWTs, no secrets in the browser.
 */
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getDb, uuid } from './db/index.ts';
import { asyncRoute, HttpError } from './util/http.ts';

const SESSION_COOKIE = 'resontune_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  role: 'listener' | 'moderator' | 'admin';
  created_at: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/**
 * Server-side role resolution.
 *
 * Roles are controlled exclusively on the server:
 *  - ADMIN_USER_IDS / MODERATOR_USER_IDS env vars (comma-separated user ids)
 *    are the production mechanism — they override whatever is in the DB row,
 *    so a compromised write to users.role cannot mint an admin.
 *  - The users.role column remains as a secondary store for roles granted
 *    by an existing admin.
 * Nothing the client sends (headers, body, localStorage) ever affects this.
 */
function envRoleFor(userId: string): 'admin' | 'moderator' | null {
  const admins = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (admins.includes(userId)) return 'admin';
  const mods = (process.env.MODERATOR_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (mods.includes(userId)) return 'moderator';
  return null;
}

function effectiveRole(user: SessionUser): SessionUser['role'] {
  const envRole = envRoleFor(user.id);
  if (envRole === 'admin') return 'admin';
  if (envRole === 'moderator') return user.role === 'admin' ? 'admin' : 'moderator';
  return user.role;
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid && /^[0-9a-f-]{36}$/.test(sid)) {
      const db = await getDb();
      const rows = await db.query<SessionUser>(
        `SELECT u.id, u.handle, u.display_name, u.avatar_url, u.role, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = $1 AND s.expires_at > now()`,
        [sid],
      );
      if (rows[0]) req.user = { ...rows[0], role: effectiveRole(rows[0]) };
    }
  } catch {
    /* treat as anonymous */
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Sign in required for this feature.'));
  next();
}

export function requireModerator(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Sign in required.'));
  if (req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return next(new HttpError(403, 'Moderator access required.'));
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Sign in required.'));
  if (req.user.role !== 'admin') {
    return next(new HttpError(403, 'Admin access required.'));
  }
  next();
}

async function createSession(res: Response, userId: string) {
  const db = await getDb();
  const sid = uuid();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sid, userId, expires.toISOString()],
  );
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

function publicUser(u: SessionUser) {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    role: u.role,
    createdAt: u.created_at,
  };
}

const githubConfigured = () =>
  Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// Dev sign-in is a development convenience. In production it is disabled
// unless explicitly re-enabled AND GitHub OAuth is absent.
const devLoginEnabled = () => {
  if (process.env.NODE_ENV === 'production') return process.env.ALLOW_DEV_LOGIN === 'true';
  return !githubConfigured() || process.env.ALLOW_DEV_LOGIN === 'true';
};

export function authRouter(): Router {
  const r = Router();

  r.get(
    '/me',
    asyncRoute(async (req, res) => {
      res.json({
        user: req.user ? publicUser(req.user) : null,
        providers: {
          github: githubConfigured(),
          dev: devLoginEnabled(),
        },
      });
    }),
  );

  /* ------------------------- dev sign-in (local) ------------------------- */

  const devLoginSchema = z.object({
    handle: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, numbers, dots, dashes and underscores only.'),
  });

  r.post(
    '/dev-login',
    asyncRoute(async (req, res) => {
      if (!devLoginEnabled()) throw new HttpError(403, 'Dev sign-in is disabled on this server.');
      const parsed = devLoginSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid handle.');
      const handle = parsed.data.handle.toLowerCase();
      const db = await getDb();
      let rows = await db.query<SessionUser>(
        `SELECT id, handle, display_name, avatar_url, role, created_at
           FROM users WHERE auth_provider = 'dev' AND handle = $1`,
        [handle],
      );
      if (!rows[0]) {
        const id = uuid();
        // DEVELOPMENT ONLY: on a fresh local database the first account
        // becomes admin so the moderation queue is reachable. This never
        // applies in production — dev-login itself is disabled there unless
        // explicitly re-enabled, and production roles come from
        // ADMIN_USER_IDS / MODERATOR_USER_IDS (see effectiveRole).
        let role = 'listener';
        if (process.env.NODE_ENV !== 'production') {
          const count = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM users`);
          if (count[0]?.n === '0') role = 'admin';
        }
        rows = await db.query<SessionUser>(
          `INSERT INTO users (id, handle, display_name, role, auth_provider)
           VALUES ($1, $2, $3, $4, 'dev')
           RETURNING id, handle, display_name, avatar_url, role, created_at`,
          [id, handle, parsed.data.handle, role],
        );
      }
      await createSession(res, rows[0].id);
      res.json({ user: publicUser(rows[0]) });
    }),
  );

  /* --------------------------- GitHub OAuth ------------------------------ */

  r.get(
    '/github',
    asyncRoute(async (req, res) => {
      if (!githubConfigured()) throw new HttpError(404, 'GitHub OAuth is not configured.');
      const state = uuid();
      res.cookie('resontune_oauth_state', state, {
        httpOnly: true, sameSite: 'lax', maxAge: 10 * 60_000, path: '/',
      });
      const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        redirect_uri: `${process.env.APP_ORIGIN ?? ''}/api/auth/github/callback`,
        scope: 'read:user',
        state,
      });
      res.redirect(`https://github.com/login/oauth/authorize?${params}`);
    }),
  );

  r.get(
    '/github/callback',
    asyncRoute(async (req, res) => {
      if (!githubConfigured()) throw new HttpError(404, 'GitHub OAuth is not configured.');
      const { code, state } = req.query as Record<string, string>;
      if (!code || !state || state !== req.cookies?.resontune_oauth_state) {
        throw new HttpError(400, 'Invalid OAuth state.');
      }
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw new HttpError(502, 'GitHub token exchange failed.');
      const ghUserRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'resontune' },
      });
      const gh = (await ghUserRes.json()) as {
        id: number; login: string; name?: string; avatar_url?: string;
      };
      if (!gh.id) throw new HttpError(502, 'GitHub profile fetch failed.');

      const db = await getDb();
      let rows = await db.query<SessionUser>(
        `SELECT id, handle, display_name, avatar_url, role, created_at
           FROM users WHERE auth_provider = 'github' AND auth_subject = $1`,
        [String(gh.id)],
      );
      if (!rows[0]) {
        const id = uuid();
        const base = gh.login.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 20) || 'listener';
        // ensure unique handle
        let handle = base;
        for (let i = 0; i < 5; i++) {
          const clash = await db.query(`SELECT 1 FROM users WHERE handle = $1`, [handle]);
          if (!clash.length) break;
          handle = `${base}-${Math.floor(Math.random() * 1000)}`;
        }
        rows = await db.query<SessionUser>(
          `INSERT INTO users (id, handle, display_name, avatar_url, auth_provider, auth_subject)
           VALUES ($1, $2, $3, $4, 'github', $5)
           RETURNING id, handle, display_name, avatar_url, role, created_at`,
          [id, handle, gh.name || gh.login, gh.avatar_url ?? null, String(gh.id)],
        );
      }
      await createSession(res, rows[0].id);
      res.redirect('/');
    }),
  );

  r.post(
    '/logout',
    asyncRoute(async (req, res) => {
      const sid = req.cookies?.[SESSION_COOKIE];
      if (sid) {
        const db = await getDb();
        await db.query(`DELETE FROM sessions WHERE id = $1`, [sid]).catch(() => {});
      }
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.json({ ok: true });
    }),
  );

  return r;
}
