import { describe, expect, it, vi } from 'vitest';

vi.mock('./_shared', async () => {
  const actual = await vi.importActual<typeof import('./_shared')>('./_shared');
  return {
    ...actual,
    session: vi.fn(async (_context: unknown, required = false) => {
      if (required) throw new actual.ApiError(401, 'Authentication required.');
      return null;
    }),
    database: vi.fn(),
  };
});

import { onRequest } from './api/[[path]]';
import { database, session, type PagesContext } from './_shared';

const call = async (path: string, init?: RequestInit) => onRequest({
  request: new Request(`https://resontune.pages.dev${path}`, init), env: {}, params: {},
} as PagesContext);

describe('Cloudflare Pages API adapter', () => {
  it('returns JSON health', async () => {
    const response = await call('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: true, name: 'resontune' });
  });
  it('does not send API auth failures through the SPA', async () => {
    const response = await call('/api/auth/me');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: null });
  });
  it('returns a JSON 404 for an unknown API path', async () => {
    const response = await call('/api/not-a-route');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  });
  it('protects admin and moderation routes before database access', async () => {
    for (const path of ['/api/admin/overview', '/api/moderation/tracks']) {
      const response = await call(path);
      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: 'Authentication required.' });
    }
  });

  it.each([
    ['/api/admin/artists', { name: 'Pages Artist' }, 'artist'],
    ['/api/admin/releases', { title: 'Pages Release', artistId: crypto.randomUUID() }, 'release'],
    ['/api/admin/tracks', { title: 'Pages Track', artistId: crypto.randomUUID() }, 'track'],
  ])('allows admin POST creation on %s collection routes', async (path, payload, key) => {
    vi.mocked(session).mockResolvedValue({
      id: crypto.randomUUID(), handle: 'admin', display_name: 'Admin',
      avatar_url: null, avatar_thumb_url: null, bio: null, location: null,
      website_url: null, role: 'admin', created_at: new Date().toISOString(),
      effectiveRole: 'admin', identity: { subject: 'admin-subject', name: 'Admin', email: null, image: null },
    } as any);
    const created = { id: crypto.randomUUID(), ...(payload as object) };
    vi.mocked(database).mockResolvedValue({
      query: vi.fn(async () => [created]),
    } as any);

    const response = await call(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as Record<string, unknown>).toHaveProperty(key);
    vi.mocked(session).mockResolvedValue(null);
  });
});
