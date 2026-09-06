/**
 * Database adapter.
 *
 * - Production: Neon Postgres via @neondatabase/serverless (set DATABASE_URL).
 * - Development: embedded PGlite Postgres stored under var/pglite so the
 *   whole stack runs locally with zero external services.
 *
 * Both drivers speak the same `query(text, params)` interface, so the rest of
 * the server never cares which one is active.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  driver: 'neon' | 'pglite';
}

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres/.test(url)) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    console.log('[db] using Neon Postgres');
    return {
      driver: 'neon',
      async query<T>(text: string, params: unknown[] = []) {
        const rows = await sql.query(text, params);
        return rows as T[];
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.resolve(__dirname, '../../var/pglite');
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = await PGlite.create(dataDir);
  console.log('[db] using embedded PGlite Postgres at var/pglite');
  return {
    driver: 'pglite',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query(text, params);
      return res.rows as T[];
    },
  };
}

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

/** Apply schema.sql (idempotent — every statement is IF NOT EXISTS). */
export async function migrate(): Promise<void> {
  const db = await getDb();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Split on semicolons at end of statements; safe because the schema file
  // contains no function bodies or literals with semicolons.
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.query(stmt);
  }
}

export const uuid = (): string => crypto.randomUUID();

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}
