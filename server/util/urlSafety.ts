/**
 * Media URL safety.
 *
 * Community submissions include audio/artwork URLs. We never fetch them
 * server-side automatically (no SSRF surface by construction) — moderators
 * open them in their own browser. Validation still rejects URLs that could
 * never be legitimate public media sources so garbage doesn't reach the
 * moderation queue or, post-approval, the catalog:
 *
 *  - https only (http allowed only for localhost in development)
 *  - no credentials in the URL
 *  - no literal private/loopback/link-local/multicast IPs
 *  - no internal-looking hostnames (.local, .internal, single-label hosts)
 *  - bounded length
 */

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|22[4-9]\.|23\d\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function validateMediaUrl(raw: string, { allowRelative = false } = {}): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return 'URL is too long.';
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
