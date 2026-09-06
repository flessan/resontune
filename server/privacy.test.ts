// @vitest-environment node
/**
 * Privacy, ownership and authorization — against the real server.
 *
 * This suite boots the actual Express app (`createApp`) on an ephemeral
 * port, against a throwaway PGlite database with the real migrations, and
 * talks to it over HTTP with real Neon Auth-shaped JWTs verified by the real
 * `jwtVerify` path. Nothing is stubbed: if authorization is wrong here, it
 * is wrong in production.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';

/* ---- environment must be in place before the server modules load ---- */

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resontune-test-'));
process.env.PGLITE_DIR = DATA_DIR;
delete process.env.DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.NEON_AUTH_URL = 'https://auth.test.invalid/neondb/auth';
delete process.env.IMGBB_API_KEY;
delete process.env.ADMIN_USER_IDS;
delete process.env.MODERATOR_USER_IDS;

let privateKey: CryptoKey;

const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
privateKey = keys.privateKey;
const publicJwk = await exportJWK(keys.publicKey);
process.env.NEON_AUTH_JWKS_JSON = JSON.stringify({ keys: [{ ...publicJwk, alg: 'EdDSA', kid: 'test' }] });

/* ---- now the server ---- */

const { createApp } = await import('../server/index.ts');
const { getDb, migrate, uuid } = await import('../server/db/index.ts');

let server: Server;
let base: string;

async function token(subject: string, name: string) {
  return new SignJWT({ name })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
    .setIssuer('https://auth.test.invalid')
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

let aliceToken = '';
let bobToken = '';
let adminToken = '';

interface Ids {
  artist: string;
  album: string;
  track: string;
}
const ids = {} as Ids;

async function call(
  pathname: string,
  { method = 'GET', auth, body, headers = {} }:
  { method?: string; auth?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const init: RequestInit = { method, headers: { ...headers } };
  if (auth) (init.headers as Record<string, string>).Authorization = `Bearer ${auth}`;
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      init.body = body;
    } else {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${base}${pathname}`, init);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, body: json, text };
}

beforeAll(async () => {
  await migrate();
  const app = await createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  aliceToken = await token('sub-alice', 'Alice');
  bobToken = await token('sub-bob', 'Bob');
  adminToken = await token('sub-admin', 'Admin');

  // Accounts are created on the first verified request.
  await call('/api/auth/me', { auth: aliceToken });
  await call('/api/auth/me', { auth: bobToken });
  await call('/api/auth/me', { auth: adminToken });

  const db = await getDb();
  await db.query(`UPDATE users SET role = 'admin' WHERE auth_subject = 'sub-admin'`);

  // A minimal catalog: one artist (linked to Alice), one release, one track.
  ids.artist = uuid();
  ids.album = uuid();
  ids.track = uuid();
  const alice = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-alice'`);
  await db.query(
    `INSERT INTO artists (id, slug, name, user_id, status) VALUES ($1, 'test-artist', 'Test Artist', $2, 'published')`,
    [ids.artist, alice[0].id],
  );
  await db.query(
    `INSERT INTO albums (id, slug, artist_id, title, status) VALUES ($1, 'test-release', $2, 'Test Release', 'published')`,
    [ids.album, ids.artist],
  );
  await db.query(
    `INSERT INTO tracks (id, slug, title, artist_id, album_id, status, license_id, rights_holder)
     VALUES ($1, 'test-track', 'Test Track', $2, $3, 'published', 'cc-by-4.0', 'Test Artist')`,
    [ids.track, ids.artist, ids.album],
  );
  await db.query(
    `INSERT INTO track_sources (id, track_id, provider, kind, url, storage)
     VALUES ($1, $2, 'hosted', 'direct_url', 'https://example.com/a.mp3', 'manual-url')`,
    [uuid(), ids.track],
  );
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

/* -------------------------------------------------------------- export */

describe('data export', () => {
  it('refuses anonymous requests', async () => {
    const res = await call('/api/me/export');
    expect(res.status).toBe(401);
    expect(res.text).not.toContain('playlists');
  });

  it('rejects a forged token', async () => {
    const forged = await new SignJWT({ name: 'Mallory' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'test' })
      .setIssuer('https://auth.test.invalid')
      .setSubject('sub-alice')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign((await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })).privateKey);
    const res = await call('/api/me/export', { auth: forged });
    expect(res.status).toBe(401);
  });

  it('exports only the requesting account, and never auth internals', async () => {
    // Alice owns a playlist with the track and has it favorited.
    const created = await call('/api/playlists', {
      method: 'POST', auth: aliceToken, body: { title: 'Alice mix', isPublic: false },
    });
    expect(created.status).toBeLessThan(300);
    const playlistId = created.body.playlist.id;
    await call(`/api/playlists/${playlistId}/tracks`, {
      method: 'POST', auth: aliceToken, body: { trackId: ids.track },
    });
    await call(`/api/me/favorites/${ids.track}`, { method: 'POST', auth: aliceToken });

    await call('/api/playlists', { method: 'POST', auth: bobToken, body: { title: 'Bob mix', isPublic: true } });

    const res = await call('/api/me/export', { auth: aliceToken });
    expect(res.status).toBe(200);
    expect(res.body.account.username).toBe('alice');
    expect(res.body.playlists.map((p: any) => p.title)).toEqual(['Alice mix']);
    expect(res.text).not.toContain('Bob mix');
    expect(res.body.playlists[0].tracks[0].title).toBe('Test Track');
    expect(res.body.favorites[0].slug).toBe('test-track');

    // No credentials, no auth-provider identifiers, no other accounts.
    expect(res.text).not.toContain('sub-alice');
    expect(res.text).not.toContain('auth_subject');
    expect(res.text).not.toContain('authSubject');
    expect(res.text).not.toContain('password');
    expect(JSON.stringify(res.body.account)).not.toContain('sub-');
  });
});

/* ------------------------------------------------------------- profile */

describe('profile correction', () => {
  it('writes only the caller\u2019s own row', async () => {
    const before = await call('/api/users/bob');
    const res = await call('/api/me/profile', {
      method: 'PATCH', auth: aliceToken,
      body: { displayName: 'Alice Edited', bio: 'hello', id: 'ignored', role: 'admin' },
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.displayName).toBe('Alice Edited');
    // system fields are not editable from the body
    expect(res.body.profile.role).toBe('listener');
    const after = await call('/api/users/bob');
    expect(after.body.profile.displayName).toBe(before.body.profile.displayName);
    expect(after.body.profile.bio).toBeNull();
  });

  it('needs authentication', async () => {
    const res = await call('/api/me/profile', { method: 'PATCH', body: { displayName: 'nope' } });
    expect(res.status).toBe(401);
  });

  it('rejects a website URL pointing at an internal address', async () => {
    for (const websiteUrl of ['http://127.0.0.1:8787/admin', 'http://169.254.169.254/latest/meta-data', 'https://router.local/']) {
      const res = await call('/api/me/profile', { method: 'PATCH', auth: aliceToken, body: { websiteUrl } });
      expect(res.status, websiteUrl).toBe(400);
    }
  });

  it('never exposes private account fields on a public profile', async () => {
    const res = await call('/api/users/alice');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('sub-alice');
    expect(res.body.profile.email).toBeUndefined();
    expect(res.body.profile.authSubject).toBeUndefined();
    expect(res.body.stats.favorites).toBeDefined();
    expect(res.body.profile.history).toBeUndefined();
  });
});

/* --------------------------------------------------------------- admin */

describe('admin authorization', () => {
  it('keeps the catalog manager away from listeners and anonymous callers', async () => {
    expect((await call('/api/admin/overview')).status).toBe(401);
    expect((await call('/api/admin/overview', { auth: aliceToken })).status).toBe(403);
    expect((await call('/api/admin/overview', { auth: adminToken })).status).toBe(200);
  });

  it('does not let a client claim a role', async () => {
    const res = await call('/api/auth/me', {
      auth: aliceToken, headers: { 'X-Role': 'admin' },
    });
    expect(res.body.user.role).toBe('listener');
  });
});

/* -------------------------------------------------------------- avatar */

describe('avatar upload', () => {
  it('never reveals the image-host key', async () => {
    process.env.IMGBB_API_KEY = 'super-secret-key';
    try {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const res = await call('/api/me/avatar', {
        method: 'POST', auth: aliceToken, body: png,
        headers: { 'Content-Type': 'image/png' },
      });
      // Uploading fails in a test (no network to ImgBB) — what matters is
      // that neither the body nor the error carries the key.
      expect(res.text).not.toContain('super-secret-key');
    } finally {
      delete process.env.IMGBB_API_KEY;
    }
  });

  it('rejects a file whose contents are not the declared image type', async () => {
    process.env.IMGBB_API_KEY = 'super-secret-key';
    try {
      const script = new TextEncoder().encode('<?php system($_GET["c"]); ?>');
      const res = await call('/api/me/avatar', {
        method: 'POST', auth: aliceToken, body: script,
        headers: { 'Content-Type': 'image/png' },
      });
      expect(res.status).toBe(415);
      expect(res.text).not.toContain('super-secret-key');

      const disguised = await call('/api/me/avatar', {
        method: 'POST', auth: aliceToken, body: script,
        headers: { 'Content-Type': 'application/x-php' },
      });
      expect(disguised.status).toBe(415);
    } finally {
      delete process.env.IMGBB_API_KEY;
    }
  });

  it('needs authentication', async () => {
    const res = await call('/api/me/avatar', {
      method: 'POST', body: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'image/png' },
    });
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------- history */

describe('listening history', () => {
  it('clears only the caller\u2019s history', async () => {
    const db = await getDb();
    const [alice] = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-alice'`);
    const [bob] = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-bob'`);
    await db.query(`INSERT INTO play_history (id, user_id, track_id) VALUES ($1, $2, $3)`, [uuid(), alice.id, ids.track]);
    await db.query(`INSERT INTO play_history (id, user_id, track_id) VALUES ($1, $2, $3)`, [uuid(), bob.id, ids.track]);

    expect((await call('/api/me/history', { method: 'DELETE' })).status).toBe(401);
    const res = await call('/api/me/history', { method: 'DELETE', auth: aliceToken });
    expect(res.status).toBe(200);

    const left = await db.query<{ user_id: string }>(`SELECT user_id FROM play_history`);
    expect(left.map((r) => r.user_id)).toEqual([bob.id]);
  });
});

/* ------------------------------------------------------ account deletion */

describe('account deletion', () => {
  it('requires authentication', async () => {
    const res = await call('/api/me', { method: 'DELETE', body: { confirm: 'alice' } });
    expect(res.status).toBe(401);
  });

  it('requires the account\u2019s own username as confirmation', async () => {
    expect((await call('/api/me', { method: 'DELETE', auth: aliceToken })).status).toBe(400);
    expect((await call('/api/me', { method: 'DELETE', auth: aliceToken, body: { confirm: 'bob' } })).status).toBe(400);
    const db = await getDb();
    const still = await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-alice'`);
    expect(still.length).toBe(1);
  });

  it('removes the account and everything it owns, and nothing else', async () => {
    const db = await getDb();
    const [alice] = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-alice'`);
    await db.query(
      `INSERT INTO entity_links (id, entity_kind, entity_id, provider, label, url)
       VALUES ($1, 'user', $2, 'website', 'Site', 'https://example.com')`, [uuid(), alice.id],
    );
    const likesBefore = await db.query<{ like_count: string }>(
      `SELECT like_count::text FROM tracks WHERE id = $1`, [ids.track],
    );

    const res = await call('/api/me', { method: 'DELETE', auth: aliceToken, body: { confirm: 'Alice' } });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.note).toMatch(/Neon Auth/);

    // gone: account, playlists, favorites, history, profile links
    expect((await db.query(`SELECT 1 FROM users WHERE id = $1`, [alice.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM playlists WHERE owner_id = $1`, [alice.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM favorites WHERE user_id = $1`, [alice.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM play_history WHERE user_id = $1`, [alice.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM entity_links WHERE entity_kind = 'user' AND entity_id = $1`, [alice.id])).length).toBe(0);

    // kept: the shared catalog, with the account reference cleared
    const artist = await db.query<{ user_id: string | null; status: string }>(
      `SELECT user_id, status FROM artists WHERE id = $1`, [ids.artist],
    );
    expect(artist.length).toBe(1);
    expect(artist[0].user_id).toBeNull();
    expect((await db.query(`SELECT 1 FROM albums WHERE id = $1`, [ids.album])).length).toBe(1);
    expect((await db.query(`SELECT 1 FROM tracks WHERE id = $1`, [ids.track])).length).toBe(1);
    expect((await db.query(`SELECT 1 FROM track_sources WHERE track_id = $1`, [ids.track])).length).toBe(1);

    // kept: everyone else
    expect((await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-bob'`)).length).toBe(1);
    expect((await db.query(`SELECT 1 FROM playlists WHERE title = 'Bob mix'`)).length).toBe(1);
    expect((await db.query(`SELECT 1 FROM play_history WHERE user_id <> $1`, [alice.id])).length).toBe(1);

    // the public like counter was corrected, not left inflated
    const likesAfter = await db.query<{ like_count: string }>(
      `SELECT like_count::text FROM tracks WHERE id = $1`, [ids.track],
    );
    expect(Number(likesAfter[0].like_count)).toBe(Math.max(0, Number(likesBefore[0].like_count) - 1));
  });

  it('leaves the deleted account unable to act, and a new sign-in starts empty', async () => {
    const res = await call('/api/auth/me', { auth: aliceToken });
    expect(res.status).toBe(200);
    // The same verified identity maps to a brand-new, empty account.
    const exported = await call('/api/me/export', { auth: aliceToken });
    expect(exported.status).toBe(200);
    expect(exported.body.playlists).toEqual([]);
    expect(exported.body.favorites).toEqual([]);
    expect(exported.body.listeningHistory).toEqual([]);
  });
});

/* ------------------------------------------------------- public surface */

describe('public surface', () => {
  it('serves the catalog anonymously', async () => {
    const res = await call('/api/tracks?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tracks)).toBe(true);
  });

  it('answers an empty catalog without failing', async () => {
    const db = await getDb();
    await db.query(`DELETE FROM track_sources`);
    await db.query(`DELETE FROM tracks`);
    await db.query(`DELETE FROM albums`);
    await db.query(`DELETE FROM artists`);
    for (const p of ['/api/tracks', '/api/artists', '/api/albums', '/api/search?q=anything', '/api/site/config']) {
      const res = await call(p);
      expect(res.status, p).toBe(200);
    }
  });
});
