/**
 * Media / link URL safety.
 *
 * ResonTune never hosts catalog audio or artwork: an administrator verifies
 * the media by hand and pastes an already-hosted direct URL, which is what
 * the database stores. Validation is therefore deliberately *deterministic
 * and offline* — the server never fetches a submitted URL to "inspect" it,
 * so no SSRF surface is created by validation itself.
 *
 * Rejected by construction:
 *  - anything but https (http allowed only for localhost in development)
 *  - credentials embedded in the URL
 *  - literal private / loopback / link-local / carrier-NAT / multicast IPs
 *  - IPv6 literals and internal-looking hostnames (.local, .internal, .lan)
 *  - single-label hostnames (intranet targets)
 *  - absurdly long URLs
 */

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|22[4-9]\.|23\d\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export const MAX_URL_LENGTH = 500;

/**
 * People type "example.com/artist" far more often than they type the scheme.
 * Prefix https:// when a value has no scheme at all — anything that *does*
 * carry a scheme (including `javascript:` or `http:`) is passed through
 * untouched so the checks below can reject it on its own terms.
 */
export function coerceHttps(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return value;         // relative, handled by callers
  return `https://${value}`;
}

/**
 * Core check shared by every URL field. Returns an error message, or null
 * when the URL is acceptable.
 */
export function validateMediaUrl(raw: string, { allowRelative = false } = {}): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return 'URL is too long.';
  if (!raw.trim()) return 'URL is empty.';
  if (allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Not a valid URL.';
  }

  const devHttpOk =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (url.protocol !== 'https:' && !devHttpOk) {
    return 'Only https:// URLs are accepted.';
  }
  if (url.username || url.password) return 'URLs must not contain credentials.';

  const host = url.hostname.toLowerCase();
  if (!devHttpOk) {
    if (PRIVATE_V4.test(host)) return 'Private or reserved addresses are not allowed.';
    if (host === 'localhost' || host.endsWith('.localhost')) return 'Localhost is not allowed.';
    if (host.startsWith('[')) return 'IPv6 literals are not allowed.';
    if (host.includes(':')) return 'IPv6 literals are not allowed.';
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
      return 'Internal hostnames are not allowed.';
    }
    if (!host.includes('.')) return 'Hostname must be a public domain.';
  }
  return null;
}

/** Known-good audio container/codec extensions, used for a soft hint only. */
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm'];

/**
 * Audio URL for a catalog track. Same safety rules as any media URL, plus a
 * requirement that the URL actually points at a file path (a bare origin is
 * never a stream). The extension is *not* required — signed CDN URLs and
 * key-based paths are legitimate — so this stays a format check, never a
 * fetch.
 */
export function validateAudioUrl(raw: string): string | null {
  const base = validateMediaUrl(raw);
  if (base) return base;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Not a valid URL.';
  }
  if (url.pathname === '/' || url.pathname === '') {
    return 'Point at the audio file itself, not just the domain.';
  }
  return null;
}

/** True when the audio URL ends in a recognised audio extension. */
export function looksLikeAudioFile(raw: string): boolean {
  try {
    const p = new URL(raw).pathname.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => p.endsWith(ext));
  } catch {
    return false;
  }
}

/** Artwork URL: safe scheme, public host, and an actual resource path. */
export function validateImageUrl(raw: string, { allowRelative = false } = {}): string | null {
  const base = validateMediaUrl(raw, { allowRelative });
  if (base) return base;
  if (allowRelative && raw.startsWith('/')) return null;
  try {
    const url = new URL(raw);
    if (url.pathname === '/' || url.pathname === '') {
      return 'Point at the image itself, not just the domain.';
    }
  } catch {
    return 'Not a valid URL.';
  }
  return null;
}

/** External/social link on a profile or catalog entity. */
export function validateLinkUrl(raw: string): string | null {
  return validateMediaUrl(raw);
}

/** Host of a URL, for display ("cdn.example.com"). Empty when unparseable. */
export function urlHost(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return '';
  }
}
