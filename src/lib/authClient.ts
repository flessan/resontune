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
