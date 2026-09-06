/**
 * Authentication — Neon Auth.
 *
 * ResonTune never requires an account for listening. Accounts unlock cloud
 * features (synced playlists, favorites, history).
 *
 * Architecture:
 *   Neon Auth (managed Better Auth) is the single authentication authority.
 *   The frontend signs in against the Neon Auth endpoint directly and sends
 *   the issued JWT as `Authorization: Bearer <token>` on every API call.
 *   This server verifies the token cryptographically against the Neon Auth
 *   JWKS (EdDSA/Ed25519) — signatures, expiry and issuer are all checked;
 *   payloads are never trusted un-verified.
 *
 * Identity mapping:
 *   The verified `sub` claim (the Neon Auth user id) maps onto ResonTune's
 *   users table via (auth_provider='neon', auth_subject=sub). Rows are
 *   created on first verified request. Nothing client-supplied — no ids,
 *   no emails, no roles — ever selects the account.
 *
 * Authorization stays ResonTune's own:
 *   listener / moderator / admin roles live server-side. Production roles
 *   come from ADMIN_USER_IDS / MODERATOR_USER_IDS env allowlists (ResonTune
 *   user ids) overriding the users.role column. The client is never asked.
 */
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';
import { getDb, uuid } from './db/index.ts';
import { asyncRoute, HttpError } from './util/http.ts';
import { checkUsername, suggestUsername } from './util/username.ts';
import { effectiveRole } from './util/roles.ts';

/** Base URL of the Neon Auth deployment (…/neondb/auth). */
const NEON_AUTH_URL = (process.env.NEON_AUTH_URL ?? '').replace(/\/+$/, '');
/** JWKS endpoint — overridable, defaults to the well-known path. */
const NEON_AUTH_JWKS_URL =
  process.env.NEON_AUTH_JWKS_URL ?? (NEON_AUTH_URL ? `${NEON_AUTH_URL}/.well-known/jwks.json` : '');

const authConfigured = () => Boolean(NEON_AUTH_URL && NEON_AUTH_JWKS_URL);

/**
 * JWKS key source. Normally fetched from the Neon Auth well-known endpoint
 * (with jose's built-in caching/cooldown). NEON_AUTH_JWKS_JSON optionally
 * pins the key set inline — same cryptographic verification, no network —
 * for restricted environments. Created lazily so a server without auth
 * configured still starts (anonymous listening works).
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const inline = process.env.NEON_AUTH_JWKS_JSON;
    jwks = inline
      ? createLocalJWKSet(JSON.parse(inline))
      : createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
  }
  return jwks;
}

export interface SessionUser {
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
}

/** Columns that make up a session user — shared by every lookup below. */
export const SESSION_USER_COLUMNS = `id, handle, display_name, avatar_url, avatar_thumb_url,
       bio, location, website_url, role, created_at`;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/* ------------------------------ verification ----------------------------- */

interface VerifiedIdentity {
  subject: string;           // Neon Auth user id (stable)
  name: string | null;
  email: string | null;
  image: string | null;
}

/**
 * Cryptographically verify a Neon Auth JWT. Rejects malformed tokens, bad
 * signatures, expired tokens and wrong issuers. Neon Auth signs with
 * EdDSA (Ed25519) and sets `iss` to the origin of the auth URL.
 */
async function verifyToken(token: string): Promise<VerifiedIdentity | null> {
  if (!authConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: new URL(NEON_AUTH_URL).origin,
      algorithms: ['EdDSA'],
    });
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    return {
      subject: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      image: typeof payload.picture === 'string' ? payload.picture
        : typeof payload.image === 'string' ? payload.image : null,
    };
  } catch {
    return null; // invalid signature / expired / malformed → anonymous
  }
}

/* ------------------------------ user mapping ----------------------------- */

function handleFrom(identity: VerifiedIdentity): string {
  const seed = identity.name ?? identity.email?.split('@')[0] ?? 'listener';
  const candidate = suggestUsername(seed);
  // Never mint a reserved or malformed handle for a brand-new account.
  return checkUsername(candidate).ok ? candidate : `listener-${Math.floor(Math.random() * 10000)}`;
}

/** Find or create the ResonTune user for a verified Neon Auth identity. */
async function userForIdentity(identity: VerifiedIdentity): Promise<SessionUser> {
  const db = await getDb();
  const rows = await db.query<SessionUser>(
    `SELECT ${SESSION_USER_COLUMNS}
       FROM users WHERE auth_provider = 'neon' AND auth_subject = $1`,
    [identity.subject],
  );
  if (rows[0]) return rows[0];

  const id = uuid();
  const base = handleFrom(identity);
  let handle = base;
  for (let i = 0; i < 6; i++) {
    const clash = await db.query(`SELECT 1 FROM users WHERE handle = $1`, [handle]);
    if (!clash.length) break;
    handle = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  const created = await db.query<SessionUser>(
    `INSERT INTO users (id, handle, display_name, avatar_url, avatar_source,
                        auth_provider, auth_subject)
     VALUES ($1, $2, $3, $4, $5, 'neon', $6)
     ON CONFLICT (auth_provider, auth_subject) WHERE auth_subject IS NOT NULL DO NOTHING
     RETURNING ${SESSION_USER_COLUMNS}`,
    [id, handle, identity.name ?? handle, identity.image, identity.image ? 'auth' : null, identity.subject],
  );
  if (created[0]) return created[0];
  // concurrent first request created it — read it back
  const again = await db.query<SessionUser>(
    `SELECT ${SESSION_USER_COLUMNS}
       FROM users WHERE auth_provider = 'neon' AND auth_subject = $1`,
    [identity.subject],
  );
  if (!again[0]) throw new HttpError(500, 'Account mapping failed.');
  return again[0];
}

/* ------------------------------- middleware ------------------------------ */

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const identity = await verifyToken(header.slice(7));
      if (identity) {
        const user = await userForIdentity(identity);
        req.user = { ...user, role: effectiveRole(user.id, user.role) };
      }
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

/* --------------------------------- routes -------------------------------- */

export function publicUser(u: SessionUser) {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    avatarThumbUrl: u.avatar_thumb_url,
    bio: u.bio,
    location: u.location,
    websiteUrl: u.website_url,
    role: u.role,
    createdAt: u.created_at,
  };
}

export function authRouter(): Router {
  const r = Router();

  /**
   * Who am I, according to my verified token? Also tells the client whether
   * Neon Auth is configured (and where), so the sign-in UI can point at it.
   */
  r.get(
    '/me',
    asyncRoute(async (req, res) => {
      res.json({
        user: req.user ? publicUser(req.user) : null,
        auth: { configured: authConfigured(), url: authConfigured() ? NEON_AUTH_URL : null },
      });
    }),
  );

  return r;
}
