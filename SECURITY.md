# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the
maintainers (see repository profile) or use GitHub's private vulnerability
reporting ("Report a vulnerability" under the Security tab). We aim to
acknowledge reports within 72 hours.

Please include reproduction steps and the affected endpoint/component.

## Scope highlights

Things we consider vulnerabilities:

- Authentication or session bypass (`server/auth.ts`, `sessions` table)
- Authorization bypass (accessing/editing another user's playlists,
  favorites, history or submissions; reaching moderation endpoints as a
  non-moderator)
- SQL injection (all queries must be parameterized)
- Stored XSS via user-submitted metadata (titles, descriptions, lyrics,
  moderator notes)
- Secret leakage to the client (the browser must never receive credentials,
  OAuth secrets, or database URLs)
- Rate-limit or submission-cooldown bypass that enables abuse at scale

## Design posture

- Sessions are opaque server-side ids in `httpOnly` cookies; no tokens in JS.
- All mutations are validated server-side with zod; client validation is
  cosmetic only.
- All list endpoints are paginated with hard bounds; JSON bodies are capped.
- Per-IP rate limits, stricter limits on writes and sign-in, submission
  cooldowns and per-user pending caps.
- `trust proxy` is enabled for deployment behind Cloudflare/WAF; public
  catalog reads send cache headers so a CDN can absorb read traffic.
- Local music never leaves the browser; there is no upload endpoint.
