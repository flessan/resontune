/**
 * Database adapter + migration runner.
 *
 * Production : Neon Postgres via @neondatabase/serverless (DATABASE_URL).
 * Development: embedded PGlite Postgres under var/pglite.
 *
 * The rest of the server speaks only `query(text, params)` — no
 * driver-specific behavior may leak past this module. Migrations are plain
 * SQL files in ./migrations, applied in filename order and tracked in
 * schema_migrations, so dev and Neon run the exact same DDL.
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
  if (process.env.NODE_ENV === 'production') {
    // The embedded database is a development convenience only.
    throw new Error(
      'DATABASE_URL is required in production. Set it to your Neon Postgres connection string.',
    );
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.resolve(__dirname, '../../var/pglite');
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = await PGlite.create(dataDir);
  console.log('[db] using embedded PGlite Postgres at var/pglite (development)');
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

/**
 * Apply ./migrations/*.sql in filename order. Each file runs once and is
 * recorded in schema_migrations. Statements are split on `;` at line ends —
 * migration files must not contain function bodies with embedded semicolons.
 */
export async function migrate(): Promise<void> {
  const db = await getDb();
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await db.query<{ name: string }>(`SELECT name FROM schema_migrations`)).map((r) => r.name),
  );
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(dir, file), 'utf8');
    const statements = sqlText
      .split(/;\s*(?:\r?\n|$)/)
      .map((raw) =>
        raw
          .split('\n')
          .filter((line) => !/^\s*--/.test(line))
          .join('\n')
          .trim(),
      )
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await db.query(stmt);
      } catch (err) {
        console.error(`[db] migration ${file} failed on statement:\n${stmt.slice(0, 200)}`);
        throw err;
      }
    }
    await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    console.log(`[db] applied migration ${file}`);
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
