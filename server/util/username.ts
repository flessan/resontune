/**
 * Username rules.
 *
 * A ResonTune username (`users.handle`) is the public identifier in
 * `/u/<username>`, so it must be normalized, unique, safe to render, and
 * never able to shadow an application route. These rules are enforced on
 * the server for every mutation; the client mirrors them only to give
 * instant feedback.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/**
 * Names the router (or a future one) owns, plus a few system words. A
 * username may never equal one of these — `/u/<name>` stays unambiguous and
 * nobody can impersonate a platform surface.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // application routes
  'about', 'admin', 'album', 'albums', 'api', 'artist', 'artists', 'auth',
  'collection', 'collections', 'community', 'contribute', 'discover',
  'favorites', 'genre', 'genres', 'help', 'history', 'home', 'library',
  'login', 'logout', 'me', 'media', 'moderation', 'new', 'originals', 'play',
  'playlist', 'playlists', 'privacy', 'profile', 'radio', 'release',
  'releases', 'search', 'security', 'settings', 'signin', 'signup', 'site',
  'submit', 'support', 'tag', 'tags', 'terms', 'track', 'tracks', 'u',
  'user', 'users',
  // system / infrastructure words
  'assets', 'cdn', 'dashboard', 'dev', 'docs', 'edit', 'mail', 'null',
  'official', 'resontune', 'root', 'static', 'staff', 'system', 'undefined',
  'webhook', 'www',
]);

/** Lowercase, strip accents, keep only safe characters, trim separators. */
export function normalizeUsername(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, USERNAME_MAX);
}

export type UsernameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validate a user-supplied username. Returns the normalized value, or a
 * human-readable reason it was rejected.
 */
export function checkUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `Username must be at most ${USERNAME_MAX} characters.` };
  }
  if (!/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/.test(value)) {
    return {
      ok: false,
      error: 'Use lowercase letters, numbers, dots, dashes and underscores; start and end with a letter or number.',
    };
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, error: 'That username is reserved.' };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(value)) {
    return { ok: false, error: 'That username looks like an internal identifier.' };
  }
  return { ok: true, value };
}

/** Derive a starting username from a display name / email local part. */
export function suggestUsername(seed: string): string {
  const base = normalizeUsername(seed) || 'listener';
  return base.length >= USERNAME_MIN ? base : `${base}-listener`.slice(0, USERNAME_MAX);
}
