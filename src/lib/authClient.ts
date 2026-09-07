/**
 * Neon Auth client — the single authentication authority.
 *
 * The frontend talks to the Neon Auth deployment directly (sign in / sign
 * up / session / sign out). For ResonTune API calls we attach the JWT that
 * Neon Auth issues as `Authorization: Bearer <token>`; the API verifies it
 * cryptographically against the JWKS. No custom OAuth stacks, no dev login.
 *
 * Configured via VITE_NEON_AUTH_URL. When absent, the app runs fully
 * anonymous — browsing, playback and local music never require an account.
 */
import { createAuthClient } from '@neondatabase/neon-js/auth';

export const NEON_AUTH_URL: string | null =
  (import.meta.env.VITE_NEON_AUTH_URL as string | undefined)?.replace(/\/+$/, '') ?? null;

export const authClient = NEON_AUTH_URL ? createAuthClient(NEON_AUTH_URL) : null;

/* ----------------------------- token caching ----------------------------- */

let cachedToken: string | null = null;
let cachedExp = 0; // seconds since epoch
let failedUntil = 0; // negative cache: don't re-hit an unreachable endpoint per call

function decodeExp(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

/**
 * Current bearer token for API calls, refreshed from Neon Auth when the
 * cached one is within 30s of expiry. Returns null when signed out.
 * (Decoding `exp` here only schedules refresh — verification is the
 * server's job.)
 */
export async function getToken(): Promise<string | null> {
  if (!authClient) return null;
  const now = Date.now() / 1000;
  if (cachedToken && cachedExp - 30 > now) return cachedToken;
  if (now < failedUntil) return null;
  try {
    const { data } = await authClient.token();
    if (data?.token) {
      cachedToken = data.token;
      cachedExp = decodeExp(data.token);
      return cachedToken;
    }
    failedUntil = now + 20; // signed out — don't ask again for a bit
  } catch {
    failedUntil = now + 20; // unreachable — keep the app fast, stay anonymous
  }
  cachedToken = null;
  cachedExp = 0;
  return null;
}

export function clearToken() {
  cachedToken = null;
  cachedExp = 0;
  failedUntil = 0;
}

/* -------------------------- identity deletion ---------------------------- */

/**
 * Outcome of asking Neon Auth to delete the sign-in identity itself.
 *
 * ResonTune deliberately has no admin credentials for the identity
 * provider, so this is the account holder's own request, made from their own
 * session — the same self-service endpoint the Neon Auth account UI uses.
 * Whether it is available at all is a property of the Neon Auth deployment
 * (Better Auth's `user.deleteUser` must be enabled), which is why every
 * outcome below is reported honestly rather than assumed.
 */
export type IdentityDeletion =
  | { status: 'deleted' }
  | { status: 'verification-sent' }
  | { status: 'unsupported'; message: string }
  | { status: 'failed'; message: string }
  | { status: 'not-configured' };

interface AuthResult {
  data?: { success?: boolean; message?: string } | null;
  /**
   * Better Auth is inconsistent here: some builds resolve with an `error`
   * object, others throw an `AuthApiError`; the HTTP status appears as
   * `status: 404`, `status: 'NOT_FOUND'` or `statusCode`. Accept all of it.
   */
  error?: AuthFailure | null;
}

interface AuthFailure {
  message?: string;
  status?: number | string;
  statusCode?: number;
  code?: string;
}

/**
 * Turn whatever Neon Auth reported into one of the honest outcomes.
 *
 * A 404 means this deployment has no self-service deletion endpoint (or no
 * such user behind it). Either way the identity was **not** deleted by us,
 * which is what the user is told — never the reverse.
 *
 * Exported for tests: this classification decides what a person is told
 * about their own identity, so it is worth pinning down.
 */
export function classifyIdentityFailure(raw: unknown): IdentityDeletion {
  const err = (raw ?? {}) as AuthFailure;
  const code = typeof err.statusCode === 'number' ? err.statusCode
    : typeof err.status === 'number' ? err.status : undefined;
  const label = `${typeof err.status === 'string' ? err.status : ''} ${err.code ?? ''}`;
  const message = err.message ?? (raw instanceof Error ? raw.message : '') ?? '';
  const unsupported =
    code === 404 || code === 501
    || /not_found|not_implemented|user_not_found|not_enabled|disabled/i.test(label)
    || (code === undefined && /not found|not implemented/i.test(message));
  if (unsupported) {
    return {
      status: 'unsupported',
      message: 'Self-service identity deletion is not available on this Neon Auth deployment.',
    };
  }
  return { status: 'failed', message: message || 'Neon Auth refused the deletion request.' };
}

/**
 * Ask Neon Auth to delete the identity behind the current session.
 *
 * Returns rather than throws: the caller has already deleted the ResonTune
 * data at this point, and the user needs to be told exactly what did and
 * did not happen.
 */
export async function deleteIdentity(): Promise<IdentityDeletion> {
  if (!authClient) return { status: 'not-configured' };
  const client = authClient as unknown as { deleteUser?: (body?: unknown) => Promise<AuthResult> };
  if (typeof client.deleteUser !== 'function') {
    return { status: 'unsupported', message: 'This Neon Auth client has no self-service deletion endpoint.' };
  }
  try {
    const res = await client.deleteUser({ callbackURL: '/' });
    if (res?.error) return classifyIdentityFailure(res.error);
    // Deployments that verify by email answer "Verification email sent" and
    // delete only when the link is opened. That is not a deletion yet.
    if (typeof res?.data?.message === 'string' && /verification/i.test(res.data.message)) {
      return { status: 'verification-sent' };
    }
    return { status: 'deleted' };
  } catch (err) {
    // The Neon client throws an AuthApiError instead of resolving with one.
    return classifyIdentityFailure(err);
  }
}

/**
 * Drop the caches that identify an account in this browser.
 *
 * Deliberately narrow: the API response cache holds signed-in answers, so it
 * goes. Local music (IndexedDB `resontune-local`), the queue and UI
 * preferences belong to the person and the device, not to the account, and
 * are never touched by an account deletion — the app has no business
 * deleting someone's own files because a server row went away.
 */
export async function clearAccountScopedCaches(): Promise<void> {
  clearToken();
  try {
    if (typeof caches === 'undefined') return;
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.includes('-api')).map((n) => caches.delete(n)));
  } catch {
    /* cache storage unavailable (private mode, old browser) — not fatal */
  }
}
