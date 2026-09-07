# Data retention review

An audit of **what this codebase actually keeps, for how long, and who
decides** — written by reading the migrations in `server/db/migrations`, the
routes in `server/routes` and `server/auth.ts`. It documents behaviour; it
does not introduce a retention framework, a scheduler or a policy engine, and
it invents no legal retention period.

> Reviewed against the implementation on **2026-09-07**. Nothing here is
> legal advice, and nothing here claims compliance with any regime. Items
> that need a person rather than a commit are marked
> **Operator decision** or **Legal decision**.

## 1. How to read this

Three different parties control retention, and conflating them is how
privacy pages become untrue:

| Layer | Controlled by | Changed how |
| --- | --- | --- |
| **Application** | this repository | code + a deploy |
| **Infrastructure** | the host/CDN and its log settings | platform configuration |
| **Provider** | Neon (backups, PITR, `neon_auth`), ImgBB | the provider's plan and API |

Only the first layer can promise anything in a pull request.

## 2. Application-controlled data

| Data | Where | Retention today | Erased by | Automatic expiry? |
| --- | --- | --- | --- | --- |
| Account + profile (`users`) | app DB | until the member edits or deletes it | `DELETE /api/me` | no |
| Playlists, playlist tracks, likes | app DB | until deleted by the owner | owner action; `ON DELETE CASCADE` with the account | no |
| Favorites | app DB | until removed | member action; CASCADE | no |
| Listening history (`play_history`) | app DB | indefinite | `DELETE /api/me/history`; CASCADE with the account | **no** — stated as such on `/privacy` |
| Anonymous play counts (`play_events`) | app DB | indefinite | nothing — there is nothing personal to erase (`track_id`, `played_at` only) | no |
| Profile links (`entity_links`, `entity_kind='user'`) | app DB | until edited | deleted explicitly by the account-deletion route (no FK) | no |
| Moderation + takedown records (`takedowns`, `moderation_events`, `submissions`) | app DB | indefinite, as an audit trail | account reference cleared (`SET NULL`); the decision itself stays | no |
| Editorial attribution (`collections.curator_id`, `community_picks.picked_by`, `site_settings.updated_by`) | app DB | indefinite | `SET NULL` on account deletion | no |
| Catalog (`artists`, `albums`, `tracks`, sources, genres, tags, lyrics, licenses) | app DB | indefinite — shared records, not personal data | admin action | no |
| **Deletion tombstones** (`deleted_identities`) | app DB | `IDENTITY_TOMBSTONE_HOURS`, **default 24 h** | expires, then swept by the next deletion | **yes** |
| Rate-limit counters | process memory | 60-second window | process restart | yes |
| Avatar image bytes | ImgBB (see §4) | — | — | — |

Notes that matter for accuracy:

- **There is no scheduled cleanup job anywhere in the codebase.** A grep for
  `setInterval`/cron in `server/` returns nothing. The only expiring record is
  the tombstone, and it is swept opportunistically by the next deletion rather
  than by a timer — which is why the table stays proportional to *recent*
  deletions instead of growing forever, without a background worker.
- **`play_history` is the one substantial personal accumulation.** It is
  user-erasable in one click and cascades with the account. Whether it should
  additionally expire (90 days? a year?) is a product/**Operator decision**;
  the code does not pretend to make it.
- **`play_events` deliberately has no user column**, so a retention limit on
  it would protect nobody; it is kept for play counts.
- **Moderation records outliving the account is intentional** — the reference
  is cleared, the decision survives. Whether an operator must keep or must
  purge them is a **Legal decision** in their jurisdiction.

### The tombstone, specifically

`deleted_identities` is the only table this codebase writes *because* of a
deletion, so it deserves its own paragraph:

- Columns: `auth_provider`, `auth_subject` (the provider's opaque id),
  `deleted_at`, `expires_at`. No name, email, handle, IP or content.
- Purpose: bearer tokens are stateless, so without it a JWT minted before the
  deletion would re-create the account on the next request — on any instance.
- Lifetime: `IDENTITY_TOMBSTONE_HOURS` (default 24), which should exceed the
  Neon Auth token lifetime. After expiry the protection is simply that the
  account row is gone and the token has expired too.
- Growth: bounded by *deletions in the last day*, and the sweep runs inside
  the next deletion transaction.
- It is the minimum shared state that makes deletion mean the same thing on
  every instance; storing less would mean storing nothing, and storing
  nothing would mean the guarantee is per-process.

## 3. Infrastructure-controlled data

| Data | Retention | Owner |
| --- | --- | --- |
| Application stdout/stderr (5xx traces, `[auth]` warnings) | whatever the platform keeps | **Operator decision** |
| HTTP/CDN access logs, WAF logs | platform default | **Operator decision** |
| Build artifacts, deploy history | platform default | **Operator decision** |

The application writes no log file of its own, keeps no request log table and
records no IP address in the database. It logs identifiers, never bodies; the
deletion path logs the failure *class* from Neon, never the API key.

## 4. Provider-controlled data

| Data | Retention | Owner |
| --- | --- | --- |
| Neon automated backups + point-in-time recovery | the plan's window; deleted rows — including expired tombstones — persist inside it | Neon / **Operator decision** |
| Neon Auth identities (`neon_auth.users_sync`, sessions, credentials) | Neon Auth's own lifecycle. Neon's launch changelog described API deletion as a **soft delete** (`deleted_at`), so the product says "Neon Auth reports the identity as deleted" rather than promising erasure | Neon |
| ImgBB avatar images | ImgBB keeps the image at its URL; ResonTune stores only the URL and can delete its copy of that string, not the file | ImgBB / **Operator decision** |
| External media hosts (catalog audio/artwork URLs) | entirely theirs; ResonTune stores addresses | third party |

Deleting an account therefore removes the ResonTune rows immediately, but it
cannot reach into a provider snapshot. `/privacy` says exactly this.

## 5. Open items (deliberately not decided in code)

1. A retention period for `play_history` — **Operator decision**.
2. A retention period for moderation/takedown records — **Legal decision**.
3. Log retention at the hosting layer — **Operator decision**.
4. Backup/PITR window, and whether it needs to be shortened for a given
   jurisdiction — **Operator/Legal decision**.
5. Whether an operator must publish these periods to users — **Legal
   decision**. If any are set, update `/privacy` §"How long things are kept"
   and `docs/privacy-and-data.md` §4 in the same change, and bump
   `LEGAL_UPDATED`.

## Related

- [privacy-and-data.md](privacy-and-data.md) — full data inventory and the
  deletion design
- [deployment.md](deployment.md) — `IDENTITY_TOMBSTONE_HOURS`, identity
  deletion configuration
- [incident-response.md](incident-response.md) — evidence preservation, which
  temporarily competes with deletion
- [/privacy](../src/pages/legal/Privacy.tsx) — the user-facing version of this
  page, which must not say more than this document supports
