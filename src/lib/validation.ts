/**
 * Client-side mirrors of the server's validation rules.
 *
 * These exist purely to give instant feedback while typing. The server
 * re-validates everything and is the only authority - nothing here is a
 * security control.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

const RESERVED = new Set([
  'about', 'admin', 'album', 'albums', 'api', 'artist', 'artists', 'auth',
  'collection', 'collections', 'community', 'contribute', 'discover',
  'favorites', 'genre', 'genres', 'help', 'history', 'home', 'library',
  'login', 'logout', 'me', 'media', 'moderation', 'new', 'originals', 'play',
  'playlist', 'playlists', 'privacy', 'profile', 'radio', 'release',
  'releases', 'search', 'security', 'settings', 'signin', 'signup', 'site',
  'submit', 'support', 'tag', 'tags', 'terms', 'track', 'tracks', 'u',
  'user', 'users', 'assets', 'cdn', 'dashboard', 'dev', 'docs', 'edit',
  'mail', 'null', 'official', 'resontune', 'root', 'static', 'staff',
  'system', 'undefined', 'webhook', 'www',
]);

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

/** Returns an error message, or null when the username looks acceptable. */
export function usernameError(raw: string): string | null {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (!/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/.test(value)) {
    return 'Lowercase letters, numbers, dots, dashes and underscores only.';
  }
  if (RESERVED.has(value)) return 'That username is reserved.';
  return null;
}

/* ---------------------------------- URLs ---------------------------------- */

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|22[4-9]\.|23\d\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * Mirror of the server's `coerceHttps`: a typed value without a scheme is
 * read as https, so "label.example/artist" is accepted as you type.
 */
export function coerceHttps(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `https://${value}`;
}

/** Same shape checks the server performs. Returns an error, or null. */
export function urlError(raw: string, opts: { requirePath?: boolean } = {}): string | null {
  const value = coerceHttps(raw);
  if (!value) return null;
  if (value.length > 500) return 'URL is too long.';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'That is not a valid URL.';
  }
  if (url.protocol !== 'https:') return 'Use an https:// URL.';
  if (url.username || url.password) return 'Remove the credentials from the URL.';
  const host = url.hostname.toLowerCase();
  if (PRIVATE_V4.test(host) || host === 'localhost' || host.endsWith('.localhost')) {
    return 'Private and local addresses are not allowed.';
  }
  if (host.includes(':') || host.startsWith('[')) return 'IPv6 literals are not allowed.';
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    return 'Internal hostnames are not allowed.';
  }
  if (!host.includes('.')) return 'Use a public domain name.';
  if (opts.requirePath && (url.pathname === '/' || url.pathname === '')) {
    return 'Point at the file itself, not just the domain.';
  }
  return null;
}

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm'];

export function looksLikeAudioUrl(raw: string): boolean {
  try {
    const path = new URL(coerceHttps(raw)).pathname.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

export function hostOf(raw: string): string {
  try {
    return new URL(coerceHttps(raw)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* --------------------------------- avatars -------------------------------- */

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function avatarFileError(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return 'Choose a JPEG, PNG, WebP or GIF image.';
  if (file.size > AVATAR_MAX_BYTES) return 'Images must be 4 MB or smaller.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}
