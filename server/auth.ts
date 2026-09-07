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
  issuedAt: number | null;   // `iat`, seconds — used by the deletion tombstone
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
      issuedAt: typeof payload.iat === 'number' ? payload.iat : null,
      name: typeof payload.name === 'string' ? payload.name : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      image: typeof payload.picture === 'string' ? payload.picture
        : typeof payload.image === 'string' ? payload.image : null,
    };
  } catch {
    return null; // invalid signature / expired / malformed → anonymous
  }
}

/* --------------------------- deletion tombstones -------------------------- */

/**
 * Accounts are created on the first verified request, which is convenient
 * until someone deletes theirs: a JWT is stateless and stays valid until it
 * expires, so a tab still holding one would immediately recreate an empty
 * account and make "deleted" look like a lie.
 *
 * A deletion therefore writes a tombstone — the opaque provider subject, the
 * moment of deletion, an expiry — into `deleted_identities`, in the same
 * transaction that removes the account row. The database is the authority,
 * so every instance of the app refuses the same stale tokens; the map below
 * is only a per-process cache in front of it.
 *
 * Cost: none for ordinary traffic. A request whose account row exists never
 * looks at tombstones at all — the check happens only on the path that would
 * otherwise *create* an account, and the creating INSERT itself is guarded
 * by the same table so two racing requests cannot slip a resurrection in
 * between the check and the write.
 */
const TOMBSTONE_TTL_HOURS = (() => {
  const raw = Number(process.env.IDENTITY_TOMBSTONE_HOURS ?? 24);
  if (!Number.isFinite(raw)) return 24;
  return Math.min(24 * 30, Math.max(1, raw)); // 1 hour … 30 days
})();
export const TOMBSTONE_TTL_SECONDS = TOMBSTONE_TTL_HOURS * 3600;

/** Positive cache only: subject → deletion time (epoch seconds). */
const deletedSubjects = new Map<string, number>();
const TOMBSTONE_CACHE_MAX = 5_000;

/**
 * Remember a deletion in this process. The durable record is written by the
 * deletion transaction; this only spares the instance that served it from
 * asking the database again.
 */
export function markIdentityDeleted(subject: string, atSeconds = Math.floor(Date.now() / 1000)) {
  if (!subject) return;
  const cutoff = atSeconds - TOMBSTONE_TTL_SECONDS;
  for (const [key, when] of deletedSubjects) if (when < cutoff) deletedSubjects.delete(key);
  if (deletedSubjects.size >= TOMBSTONE_CACHE_MAX) {
    // Bounded memory: drop the oldest insertion (Map preserves insertion order).
    const oldest = deletedSubjects.keys().next();
    if (!oldest.done) deletedSubjects.delete(oldest.value);
  }
  deletedSubjects.set(subject, atSeconds);
}

/**
 * The statements that record a deletion, to be run inside the deletion
 * transaction. The subject is read from the row being deleted, so a caller
 * cannot tombstone somebody else's identity, and expired rows are swept in
 * the same breath — the table stays proportional to recent deletions.
 */
export function tombstoneStatements(userId: string) {
  return [
    {
      text: `INSERT INTO deleted_identities (auth_provider, auth_subject, deleted_at, expires_at)
             SELECT u.auth_provider, u.auth_subject, now(), now() + ($2 || ' seconds')::interval
               FROM users u
              WHERE u.id = $1 AND u.auth_subject IS NOT NULL
             ON CONFLICT (auth_provider, auth_subject) DO UPDATE
                SET expires_at = GREATEST(EXCLUDED.expires_at, deleted_identities.expires_at)`,
      params: [userId, String(TOMBSTONE_TTL_SECONDS)],
    },
    { text: `DELETE FROM deleted_identities WHERE expires_at < now()`, params: [] },
  ];
}

/**
 * When was this identity deleted? Cache first, then the shared table — which
 * is what makes the refusal work on an instance that never served the
 * deletion. Absence is never cached: a tombstone written by another instance
 * has to be visible immediately.
 */
async function identityDeletedAt(subject: string): Promise<number | null> {
  const cached = deletedSubjects.get(subject);
  if (cached !== undefined) {
    if (Date.now() / 1000 - cached <= TOMBSTONE_TTL_SECONDS) return cached;
    deletedSubjects.delete(subject);
  }
  try {
    const db = await getDb();
    const rows = await db.query<{ at: number | string }>(
      `SELECT extract(epoch FROM deleted_at) AS at
         FROM deleted_identities
        WHERE auth_provider = 'neon' AND auth_subject = $1 AND expires_at > now()`,
      [subject],
    );
    if (!rows[0]) return null;
    const at = Number(rows[0].at);
    if (!Number.isFinite(at)) return null;
    markIdentityDeleted(subject, at);
    return at;
  } catch {
    // A tombstone lookup that cannot run must not hand out an account.
    return Math.floor(Date.now() / 1000);
  }
}

/** True when this token predates the deletion of its own account. */
async function predatesDeletion(identity: VerifiedIdentity): Promise<boolean> {
  const deletedAt = await identityDeletedAt(identity.subject);
  if (deletedAt === null) return false;
  // No `iat` to compare against — refuse rather than resurrect.
  return identity.issuedAt === null || identity.issuedAt <= deletedAt;
}

/** Test/maintenance helper: forget this process's cache (not the table). */
export function clearIdentityTombstones() {
  deletedSubjects.clear();
}

/* ------------------------------ user mapping ----------------------------- */

function handleFrom(identity: VerifiedIdentity): string {
  const seed = identity.name ?? identity.email?.split('@')[0] ?? 'listener';
  const candidate = suggestUsername(seed);
  // Never mint a reserved or malformed handle for a brand-new account.
  return checkUsername(candidate).ok ? candidate : `listener-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Find or create the ResonTune user for a verified Neon Auth identity, or
 * return null when the identity has been deleted and this token predates it.
 *
 * The happy path is one indexed SELECT: an existing account never consults
 * the tombstone table. Only the branch that would create an account pays for
 * the check, and the INSERT repeats it as a `WHERE NOT EXISTS` guard so a
 * deletion committing between the check and the write still wins.
 */
async function userForIdentity(identity: VerifiedIdentity): Promise<SessionUser | null> {
  const db = await getDb();
  const rows = await db.query<SessionUser>(
    `SELECT ${SESSION_USER_COLUMNS}
       FROM users WHERE auth_provider = 'neon' AND auth_subject = $1`,
    [identity.subject],
  );
  if (rows[0]) return rows[0];

  // No account row: this is either a first sign-in or a token that outlived
  // the account it belonged to.
  if (await predatesDeletion(identity)) return null;

  const id = uuid();
  const base = handleFrom(identity);
  let handle = base;
  for (let i = 0; i < 6; i++) {
    const clash = await db.query(`SELECT 1 FROM users WHERE handle = $1`, [handle]);
    if (!clash.length) break;
    handle = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  const iat = identity.issuedAt;
  const created = await db.query<SessionUser>(
    `INSERT INTO users (id, handle, display_name, avatar_url, avatar_source,
                        auth_provider, auth_subject)
     SELECT $1, $2, $3, $4, $5, 'neon', $6
      WHERE NOT EXISTS (
        SELECT 1 FROM deleted_identities d
         WHERE d.auth_provider = 'neon' AND d.auth_subject = $6
           AND d.expires_at > now()
           AND ($7::float8 IS NULL OR $7::float8 <= extract(epoch FROM d.deleted_at)))
     ON CONFLICT (auth_provider, auth_subject) WHERE auth_subject IS NOT NULL DO NOTHING
     RETURNING ${SESSION_USER_COLUMNS}`,
    [id, handle, identity.name ?? handle, identity.image, identity.image ? 'auth' : null,
     identity.subject, iat],
  );
  if (created[0]) return created[0];
  // Either a concurrent first request created it, or the guard above refused.
  const again = await db.query<SessionUser>(
    `SELECT ${SESSION_USER_COLUMNS}
       FROM users WHERE auth_provider = 'neon' AND auth_subject = $1`,
    [identity.subject],
  );
  if (again[0]) return again[0];
  // Refused by the tombstone guard: remember it so a looping client stops
  // costing a write attempt per request.
  await identityDeletedAt(identity.subject);
  return null;
}

/* ------------------------------- middleware ------------------------------ */

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const identity = await verifyToken(header.slice(7));
      if (identity) {
        const user = await userForIdentity(identity);
        if (user) req.user = { ...user, role: effectiveRole(user.id, user.role) };
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
