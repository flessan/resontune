# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
private vulnerability reporting ("Report a vulnerability" under the Security
tab) or contact the maintainers listed on the repository profile. We aim to
acknowledge reports within 72 hours; this is a small volunteer project, so a
fix may take longer than an acknowledgement.

A useful report includes:

- what you found, and the affected endpoint, route or component;
- reproduction steps — a request, a payload, a sequence of clicks;
- what an attacker gets out of it (read another account's data, escalate a
  role, run script in someone else's browser…);
- the deployment and commit/version you tested against.

Please **do not** include other people's personal data, credentials or
database dumps in a report. Describe the access instead — we can reproduce it
ourselves.

### Responsible disclosure

- Test only against your own account and your own deployment. Do not access,
  modify or retain other people's data.
- No automated scanning that degrades a public deployment, no denial of
  service, no social engineering of maintainers or third-party providers.
- Give us a reasonable window to ship a fix before publishing. We will credit
  you in the advisory unless you prefer otherwise.
- Findings from an automated scanner without a demonstrated impact are
  welcome but are triaged last.

Out of scope: missing hardening headers with no exploit path, rate limits on
public read endpoints, self-XSS, issues in third-party services
(Neon, Neon Auth, ImgBB — report those to them), and anything requiring a
compromised device or a physically present attacker.

## Scope highlights

Things we consider vulnerabilities:

- Authentication bypass or token forgery (`server/auth.ts` — JWT verification
  against the Neon Auth JWKS)
- Authorization bypass: reading or editing another account's playlists,
  favorites, history, profile or export; reaching admin/moderation endpoints
  without the role
- IDOR of any kind — every owned row must be scoped by the session id
- SQL injection (all queries must be parameterized)
- Stored XSS via user-submitted metadata (profile text, playlist titles,
  track titles, descriptions, lyrics, moderator notes)
- Secret leakage to the client: the browser must never receive
  `IMGBB_API_KEY`, `DATABASE_URL` or any server credential
- SSRF or internal-network access through a media/link URL field
  (`server/util/urlSafety.ts`)
- Rate-limit bypass that enables abuse at scale
- Anything that deletes or exposes catalog or account data outside the
  documented deletion flow

## Design posture

- **Authentication** is Neon Auth. The browser holds a Neon Auth JWT and
  sends it as `Authorization: Bearer …`; the API verifies signature (EdDSA),
  issuer and expiry against the JWKS on every request. Invalid or expired
  tokens are treated as anonymous. ResonTune stores no passwords and no email
  addresses.
- **Authorization** stays server-side: the account comes from the verified
  token, never from the request body, and roles resolve through
  `effectiveRole` with `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` overriding the
  database column.
- All mutations are validated server-side with zod; client validation is
  cosmetic only.
- All list endpoints are paginated with hard bounds; JSON bodies are capped
  at 64 kB and avatar uploads at 4 MB.
- Per-IP rate limits, stricter on writes.
- Avatar uploads are type-sniffed by magic bytes, not by the declared
  `Content-Type`, and are forwarded to ImgBB by the server; the key never
  reaches the browser and no image bytes are stored in the database.
- Media and link URLs are validated offline: https only, no embedded
  credentials, no private/loopback/link-local/CGNAT addresses, no IPv6
  literals, no internal hostnames. The server never fetches a submitted URL.
- `trust proxy` is enabled for deployment behind Cloudflare/WAF; public
  catalog reads send cache headers so a CDN can absorb read traffic, while
  `/api/auth`, `/api/me`, `/api/admin` and `/api/moderation` are `no-store`.
- Local music never leaves the browser; there is no upload endpoint for it.
- Account deletion is self-service and scoped to the account: shared catalog
  records survive with their reference cleared.

## Related documents

- [docs/privacy-and-data.md](docs/privacy-and-data.md) — data inventory,
  third parties, retention, consent and dark-pattern audit
- [docs/incident-response.md](docs/incident-response.md) — what happens after
  a report is confirmed
- [/privacy](src/pages/legal/Privacy.tsx), [/terms](src/pages/legal/Terms.tsx),
  [/copyright](src/pages/legal/Copyright.tsx) — the user-facing pages
