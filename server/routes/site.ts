/**
 * Public site configuration — support links, QRIS asset, curated supporter
 * names. Values are stored in the `site_settings` table (admin-editable
 * without a rebuild) with environment variables as the fallback layer, so
 * a deploy can preconfigure links before any admin exists.
 *
 * Everything served here is public by design. Secrets never belong in this
 * table or these env vars — only publishable URLs and display names.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.ts';
import { asyncRoute, HttpError } from '../util/http.ts';
import { requireAdmin } from '../auth.ts';
import { validateMediaUrl } from '../util/urlSafety.ts';

interface SupportConfig {
  githubSponsorsUrl: string | null;
  sociabuzzUrl: string | null;
  qrisImageUrl: string | null;
  supporters: string[];        // names explicitly provided for public listing
  repoUrl: string;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.query<{ value: T | string }>(
    `SELECT value FROM site_settings WHERE key = $1`,
    [key],
  );
  if (!rows[0]) return null;
  const v = rows[0].value;
  return (typeof v === 'string' ? JSON.parse(v) : v) as T;
}

export async function getSupportConfig(): Promise<SupportConfig> {
  const stored = (await readSetting<Partial<SupportConfig>>('support')) ?? {};
  return {
    githubSponsorsUrl: stored.githubSponsorsUrl ?? process.env.GITHUB_SPONSORS_URL ?? null,
    sociabuzzUrl: stored.sociabuzzUrl ?? process.env.SOCIABUZZ_URL ?? null,
    qrisImageUrl: stored.qrisImageUrl ?? process.env.QRIS_IMAGE_URL ?? null,
    supporters: Array.isArray(stored.supporters) ? stored.supporters.slice(0, 200) : [],
    repoUrl: process.env.REPO_URL ?? 'https://github.com/flessan/resontune',
  };
}

export function siteRouter(): Router {
  const r = Router();

  /** Public: everything the About/Support pages need. */
  r.get(
    '/config',
    asyncRoute(async (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(await getSupportConfig());
    }),
  );

  /* Admin: update support settings without a rebuild. */
  const urlField = z.string().trim().max(500).nullable().optional();
  const supportSchema = z.object({
    githubSponsorsUrl: urlField,
    sociabuzzUrl: urlField,
    qrisImageUrl: urlField,
    supporters: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  });

  r.put(
    '/config/support',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const parsed = supportSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid support configuration.');
      const patch = parsed.data;
      for (const [label, value] of [
        ['GitHub Sponsors URL', patch.githubSponsorsUrl],
        ['Sociabuzz URL', patch.sociabuzzUrl],
        ['QRIS image URL', patch.qrisImageUrl],
      ] as const) {
        if (value) {
          const err = validateMediaUrl(value, { allowRelative: true });
          if (err) throw new HttpError(400, `${label}: ${err}`);
        }
      }
      const current = (await readSetting<Record<string, unknown>>('support')) ?? {};
      const merged = { ...current };
      if ('githubSponsorsUrl' in patch) merged.githubSponsorsUrl = patch.githubSponsorsUrl ?? null;
      if ('sociabuzzUrl' in patch) merged.sociabuzzUrl = patch.sociabuzzUrl ?? null;
      if ('qrisImageUrl' in patch) merged.qrisImageUrl = patch.qrisImageUrl ?? null;
      if (patch.supporters) merged.supporters = patch.supporters;
      const db = await getDb();
      await db.query(
        `INSERT INTO site_settings (key, value, updated_at, updated_by)
         VALUES ('support', $1, now(), $2)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now(), updated_by = $2`,
        [JSON.stringify(merged), req.user!.id],
      );
      res.json(await getSupportConfig());
    }),
  );

  return r;
}
