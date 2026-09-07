import { describe, expect, it } from 'vitest';
import { onRequest } from './api/[[path]]';
import type { PagesContext } from './_shared';

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
});
