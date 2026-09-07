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
import http from 'node:http';
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
const { clearIdentityTombstones } = await import('../server/auth.ts');
const { ACCOUNT_GONE_MESSAGE, isDeletedAccountViolation } = await import('../server/util/http.ts');

let server: Server;
let base: string;

/**
 * Boot another instance of the very same app against the very same
 * database. Two things need this: per-instance state (rate-limit counters,
 * the tombstone cache) and the multi-instance behaviour itself.
 */
async function bootApp(): Promise<{ server: Server; base: string }> {
  const app = await createApp();
  const s = app.listen(0);
  await new Promise<void>((resolve) => s.once('listening', () => resolve()));
  const addr = s.address();
  return { server: s, base: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` };
}

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
let deletedAliceId = '';

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
  ({ server, base } = await bootApp());

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
    expect(res.text).not.toMatch(/"(password|passwordHash|token|secret|apiKey)"\s*:/i);
    expect(JSON.stringify(res.body.account)).not.toContain('sub-');
  });
});

describe('export honesty', () => {
  it('does not list anything as missing that is actually in the file', async () => {
    const res = await call('/api/me/export', { auth: aliceToken });
    const claims: string[] = res.body.notIncluded;
    expect(claims.length).toBeGreaterThan(3);

    // each "not included" claim, checked against the payload itself
    expect(res.text).not.toContain('sub-alice');
    expect(res.text).not.toContain('auth_provider');
    expect(res.text).not.toMatch(/"(password|passwordHash|token|secret|apiKey|authSubject)"\s*:/i);
    expect(res.body.account.email).toBeUndefined();
    expect(claims.some((c) => /Neon Auth/i.test(c))).toBe(true);
    expect(claims.some((c) => /own device/i.test(c))).toBe(true);

    // ...while everything it implies is present, is present
    for (const key of ['playlists', 'favorites', 'likedPlaylists', 'listeningHistory', 'linkedArtistPages']) {
      expect(res.body[key], key).toBeDefined();
    }
    expect(res.body.account).toHaveProperty('links');
  });

  it('exports a liked playlist as a reference, not as somebody else\u2019s content', async () => {
    const created = await call('/api/playlists', {
      method: 'POST', auth: bobToken, body: { title: 'Bob public mix', isPublic: true },
    });
    const id = created.body.playlist.id;
    await call(`/api/playlists/${id}/tracks`, { method: 'POST', auth: bobToken, body: { trackId: ids.track } });
    expect((await call(`/api/playlists/${id}/like`, { method: 'POST', auth: aliceToken })).status).toBe(200);

    const res = await call('/api/me/export', { auth: aliceToken });
    const liked = res.body.likedPlaylists.find((p: any) => p.title === 'Bob public mix');
    expect(liked).toBeTruthy();
    expect(liked.tracks).toBeUndefined();
    expect(res.body.playlists.map((p: any) => p.title)).not.toContain('Bob public mix');
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
  it('leaves anonymous play counters, playlists and the catalog alone', async () => {
    const db = await getDb();
    const [alice] = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-alice'`);
    await db.query(`INSERT INTO play_events (id, track_id) VALUES ($1, $2)`, [uuid(), ids.track]);
    await db.query(`INSERT INTO play_history (id, user_id, track_id) VALUES ($1, $2, $3)`, [uuid(), alice.id, ids.track]);
    const before = {
      events: (await db.query(`SELECT 1 FROM play_events`)).length,
      plays: (await db.query<{ play_count: string }>(`SELECT play_count::text FROM tracks WHERE id = $1`, [ids.track]))[0],
      playlists: (await db.query(`SELECT 1 FROM playlists WHERE owner_id = $1`, [alice.id])).length,
      favorites: (await db.query(`SELECT 1 FROM favorites WHERE user_id = $1`, [alice.id])).length,
    };

    expect((await call('/api/me/history', { method: 'DELETE', auth: aliceToken })).status).toBe(200);

    expect((await db.query(`SELECT 1 FROM play_history WHERE user_id = $1`, [alice.id])).length).toBe(0);
    // The anonymous counter has no user column; clearing history must not touch it.
    expect((await db.query(`SELECT 1 FROM play_events`)).length).toBe(before.events);
    expect((await db.query<{ play_count: string }>(`SELECT play_count::text FROM tracks WHERE id = $1`, [ids.track]))[0])
      .toEqual(before.plays);
    expect((await db.query(`SELECT 1 FROM playlists WHERE owner_id = $1`, [alice.id])).length).toBe(before.playlists);
    expect((await db.query(`SELECT 1 FROM favorites WHERE user_id = $1`, [alice.id])).length).toBe(before.favorites);
  });

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
    deletedAliceId = alice.id;
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
    // The response must not imply the sign-in identity went with it.
    expect(res.body.scope).toBe('resontune-application-data');
    expect(res.body.identity.deletedByServer).toBe(false);
    expect(res.body.identity.provider).toBe('neon-auth');
    expect(String(res.body.identity.reason)).toMatch(/self-service|cannot/i);
    expect(res.body.retainedData.join(' ')).toMatch(/catalog/i);

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

  it('refuses tokens issued before the deletion instead of recreating the account', async () => {
    // The old token is still cryptographically valid — and must not work.
    const me = await call('/api/auth/me', { auth: aliceToken });
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();

    expect((await call('/api/me/export', { auth: aliceToken })).status).toBe(401);
    expect((await call('/api/me/profile', { method: 'PATCH', auth: aliceToken, body: { bio: 'back' } })).status).toBe(401);

    const db = await getDb();
    expect((await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-alice'`)).length).toBe(0);
  });

  it('starts a brand-new empty account when the same identity signs in again', async () => {
    // A fresh sign-in mints a token issued after the deletion.
    await new Promise((r) => setTimeout(r, 1100));
    const freshToken = await token('sub-alice', 'Alice');

    const me = await call('/api/auth/me', { auth: freshToken });
    expect(me.status).toBe(200);
    expect(me.body.user).not.toBeNull();

    const exported = await call('/api/me/export', { auth: freshToken });
    expect(exported.status).toBe(200);
    expect(exported.body.playlists).toEqual([]);
    expect(exported.body.favorites).toEqual([]);
    expect(exported.body.listeningHistory).toEqual([]);
    expect(exported.body.account.id).not.toBe(deletedAliceId);
  });
});

/* ------------------------------------- deletion durability & races */

/**
 * The tombstone is the thing that makes "deleted" true for a stateless
 * token, so it is tested the way it will be attacked: with a still-valid
 * token, on a server that has no memory of the deletion.
 */
describe('deletion durability across instances', () => {
  it('keeps refusing a stale token on an instance that never saw the deletion', async () => {
    const ghost = await token('sub-ghost', 'Ghost');
    expect((await call('/api/auth/me', { auth: ghost })).body.user).not.toBeNull();
    const del = await call('/api/me', { method: 'DELETE', auth: ghost, body: { confirm: 'ghost' } });
    expect(del.status).toBe(200);

    // A second instance: its own app, and — since the cache is per-process —
    // no memory whatsoever of the deletion. Only the shared table can carry
    // the refusal across.
    const other = await bootApp();
    clearIdentityTombstones();
    const previous = base;
    base = other.base;
    try {
      const me = await call('/api/auth/me', { auth: ghost });
      expect(me.status).toBe(200);
      expect(me.body.user).toBeNull();
      expect((await call('/api/me/export', { auth: ghost })).status).toBe(401);
      expect((await call('/api/me/profile', { method: 'PATCH', auth: ghost, body: { bio: 'hi' } })).status).toBe(401);
      expect((await call('/api/me', { method: 'DELETE', auth: ghost, body: { confirm: 'ghost' } })).status).toBe(401);
    } finally {
      base = previous;
      await new Promise<void>((resolve) => other.server.close(() => resolve()));
    }

    const db = await getDb();
    expect((await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-ghost'`)).length).toBe(0);
  });

  it('stores nothing but the opaque subject, and expires itself', async () => {
    const db = await getDb();
    const rows = await db.query<Record<string, unknown>>(
      `SELECT *, (expires_at > deleted_at) AS expires_later
         FROM deleted_identities WHERE auth_subject = 'sub-ghost'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].expires_later).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['auth_provider', 'auth_subject', 'deleted_at', 'expires_at', 'expires_later'],
    );
    // No name, no email, nothing but the id the provider issued.
    expect(JSON.stringify(rows[0])).not.toMatch(/ghost@|Ghost/);
  });

  it('sweeps expired tombstones so the table cannot grow without bound', async () => {
    const db = await getDb();
    await db.query(
      `INSERT INTO deleted_identities (auth_provider, auth_subject, deleted_at, expires_at)
       VALUES ('neon', 'sub-long-gone', now() - interval '40 days', now() - interval '39 days')
       ON CONFLICT DO NOTHING`,
    );
    expect((await db.query(`SELECT 1 FROM deleted_identities WHERE auth_subject = 'sub-long-gone'`)).length).toBe(1);

    // Any later deletion sweeps what has expired, in the same transaction.
    const sweeper = await token('sub-sweeper', 'Sweeper');
    await call('/api/auth/me', { auth: sweeper });
    expect((await call('/api/me', { method: 'DELETE', auth: sweeper, body: { confirm: 'sweeper' } })).status).toBe(200);

    expect((await db.query(`SELECT 1 FROM deleted_identities WHERE auth_subject = 'sub-long-gone'`)).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM deleted_identities WHERE auth_subject = 'sub-sweeper'`)).length).toBe(1);
  });
});

describe('deletion idempotency and concurrency', () => {
  // Its own instance: a fresh per-instance write budget, and a second
  // process's-worth of state.
  let instance: Server;
  let previous = '';
  beforeAll(async () => {
    const booted = await bootApp();
    instance = booted.server;
    previous = base;
    base = booted.base;
  });
  afterAll(async () => {
    base = previous;
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  });

  it('answers a repeated deletion deterministically instead of failing', async () => {
    const twice = await token('sub-twice', 'Twice');
    await call('/api/auth/me', { auth: twice });
    const first = await call('/api/me', { method: 'DELETE', auth: twice, body: { confirm: 'twice' } });
    expect(first.status).toBe(200);
    const second = await call('/api/me', { method: 'DELETE', auth: twice, body: { confirm: 'twice' } });
    // The account is gone, so the token no longer authenticates: 401, never 500.
    expect(second.status).toBe(401);
  });

  it('survives two deletions racing each other', async () => {
    const racer = await token('sub-racer', 'Racer');
    await call('/api/auth/me', { auth: racer });
    const [a, b] = await Promise.all([
      call('/api/me', { method: 'DELETE', auth: racer, body: { confirm: 'racer' } }),
      call('/api/me', { method: 'DELETE', auth: racer, body: { confirm: 'racer' } }),
    ]);
    for (const res of [a, b]) expect([200, 401]).toContain(res.status);
    expect([a.status, b.status]).toContain(200);
    const succeeded = [a, b].filter((r) => r.status === 200);
    // Whichever ran second removed nothing and says so.
    if (succeeded.length === 2) {
      expect(succeeded.map((r) => r.body.alreadyDeleted).sort()).toEqual([false, true]);
    }
    const db = await getDb();
    expect((await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-racer'`)).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM deleted_identities WHERE auth_subject = 'sub-racer'`)).length).toBe(1);
  });

  it('leaves no orphans when writes and playback race the deletion', async () => {
    const busy = await token('sub-busy', 'Busy');
    await call('/api/auth/me', { auth: busy });
    const db = await getDb();
    const [row] = await db.query<{ id: string }>(`SELECT id FROM users WHERE auth_subject = 'sub-busy'`);
    const trackBefore = await db.query<{ play_count: string }>(
      `SELECT play_count::text FROM tracks WHERE id = $1`, [ids.track],
    );

    const responses = await Promise.all([
      call('/api/playlists', { method: 'POST', auth: busy, body: { title: 'Racing mix', isPublic: false } }),
      call(`/api/me/favorites/${ids.track}`, { method: 'POST', auth: busy }),
      call(`/api/tracks/${ids.track}/play`, { method: 'POST', auth: busy }),
      call('/api/me', { method: 'DELETE', auth: busy, body: { confirm: 'busy' } }),
      call('/api/me/profile', { method: 'PATCH', auth: busy, body: { bio: 'still here?' } }),
    ]);
    // Deterministic: everything either did its job or was told the account is
    // gone. Nothing is a server error.
    for (const res of responses) expect(res.status).toBeLessThan(500);

    // Whatever the interleaving, the account and its rows are gone.
    expect((await db.query(`SELECT 1 FROM users WHERE id = $1`, [row.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM playlists WHERE owner_id = $1`, [row.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM favorites WHERE user_id = $1`, [row.id])).length).toBe(0);
    expect((await db.query(`SELECT 1 FROM play_history WHERE user_id = $1`, [row.id])).length).toBe(0);

    // The play, if it was recorded, counted for the track and nobody else.
    const trackAfter = await db.query<{ play_count: string }>(
      `SELECT play_count::text FROM tracks WHERE id = $1`, [ids.track],
    );
    expect(Number(trackAfter[0].play_count)).toBeGreaterThanOrEqual(Number(trackBefore[0].play_count));
  });

  it('recognises the database error a write racing a deletion produces', async () => {
    // The window between authenticating a request and writing its row cannot
    // be forced open over HTTP, so the mechanism is tested where it lives:
    // the foreign key fires, and the server reads it as "account gone" rather
    // than as a server fault.
    const db = await getDb();
    let caught: unknown = null;
    try {
      await db.query(
        `INSERT INTO playlists (id, slug, owner_id, title) VALUES ($1, $2, $3, 'Orphan')`,
        [uuid(), `orphan-${Date.now()}`, uuid()],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isDeletedAccountViolation(caught)).toBe(true);
    expect(isDeletedAccountViolation(new Error('something else'))).toBe(false);
    expect(ACCOUNT_GONE_MESSAGE).toMatch(/no longer exists/i);
  });
});

/* --------------------------------- server-side identity deletion */

/**
 * The documented Neon control-plane call, exercised against a stand-in for
 * the control plane. What is asserted is our side of the contract — method,
 * URL shape, credential handling, and how each documented status is
 * reported — not any Neon internals.
 */
describe('server-side identity deletion', () => {
  let neon: Server;
  let neonBase = '';
  let neonStatus = 204;
  let instance: Server;
  let previous = '';
  const seen: { method: string; url: string; auth: string | undefined }[] = [];

  beforeAll(async () => {
    const booted = await bootApp();
    instance = booted.server;
    previous = base;
    base = booted.base;
    neon = http.createServer((req, res) => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization });
      res.writeHead(neonStatus, { 'content-type': 'application/json' });
      res.end(neonStatus === 204 ? '' : JSON.stringify({ message: 'nope', code: 'x' }));
    });
    neon.listen(0);
    await new Promise<void>((resolve) => neon.once('listening', () => resolve()));
    const addr = neon.address();
    neonBase = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });

  afterAll(async () => {
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    delete process.env.NEON_BRANCH_ID;
    delete process.env.NEON_API_BASE;
    base = previous;
    await new Promise<void>((resolve) => neon.close(() => resolve()));
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  });

  function configure(status: number) {
    neonStatus = status;
    seen.length = 0;
    process.env.NEON_API_KEY = 'napi_secret_do_not_leak';
    process.env.NEON_PROJECT_ID = 'proj-123';
    process.env.NEON_BRANCH_ID = 'br-456';
    process.env.NEON_API_BASE = neonBase;
  }

  async function deleteWith(subject: string, name: string) {
    const t = await token(subject, name);
    await call('/api/auth/me', { auth: t });
    return call('/api/me', { method: 'DELETE', auth: t, body: { confirm: name.toLowerCase() } });
  }

  it('says the identity was not deleted when no credential is configured', async () => {
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    delete process.env.NEON_BRANCH_ID;
    const res = await deleteWith('sub-noadmin', 'Noadmin');
    expect(res.status).toBe(200);
    expect(res.body.identity.deletedByServer).toBe(false);
    expect(res.body.identity.status).toBe('not-configured');
    expect(res.body.identity.clientShouldAttempt).toBe(true);
    expect(res.body.scope).toBe('resontune-application-data');
  });

  it('deletes the identity through the documented endpoint and reports it', async () => {
    configure(204);
    const res = await deleteWith('sub-adminkill', 'Adminkill');
    expect(res.status).toBe(200);
    expect(res.body.identity.deletedByServer).toBe(true);
    expect(res.body.identity.status).toBe('deleted');
    expect(res.body.identity.clientShouldAttempt).toBe(false);
    expect(res.body.scope).toBe('resontune-application-data-and-identity');
    expect(res.body.deletedData.join(' ')).toMatch(/sign-in identity/i);
    expect(res.body.retainedData.join(' ')).not.toMatch(/sign-in identity/i);

    expect(seen.length).toBe(1);
    expect(seen[0].method).toBe('DELETE');
    expect(seen[0].url).toBe('/projects/proj-123/branches/br-456/auth/users/sub-adminkill');
    expect(seen[0].auth).toBe('Bearer napi_secret_do_not_leak');
    // The credential never travels back to the client.
    expect(res.text).not.toMatch(/napi_secret/);
  });

  it('does not claim success when the provider has no such user', async () => {
    configure(404);
    const res = await deleteWith('sub-absent', 'Absent');
    expect(res.body.identity.status).toBe('already-absent');
    expect(res.body.identity.deletedByServer).toBe(false);
    expect(res.body.identity.clientShouldAttempt).toBe(true);
    expect(res.body.scope).toBe('resontune-application-data');
  });

  it('reports a rejected credential as a failure, not as a deletion', async () => {
    configure(403);
    const res = await deleteWith('sub-rejected', 'Rejected');
    expect(res.body.identity.status).toBe('unauthorized');
    expect(res.body.identity.deletedByServer).toBe(false);
    expect(String(res.body.identity.reason)).not.toMatch(/napi_secret/);
    expect(res.text).not.toMatch(/napi_secret/);
  });

  it('reports a provider error as a failure', async () => {
    configure(500);
    const res = await deleteWith('sub-broken', 'Broken');
    expect(res.body.identity.status).toBe('failed');
    expect(res.body.identity.deletedByServer).toBe(false);
    expect(res.body.identity.clientShouldAttempt).toBe(true);
    // The ResonTune half still happened, and still says so.
    expect(res.body.deleted).toBe(true);
    const db = await getDb();
    expect((await db.query(`SELECT 1 FROM users WHERE auth_subject = 'sub-broken'`)).length).toBe(0);
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
