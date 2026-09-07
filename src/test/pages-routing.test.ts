// @vitest-environment node
import { describe, expect, it } from 'vitest';
import routesJSON from '../../public/_routes.json?raw';

describe('Cloudflare Pages routing manifest', () => {
  it('provides both required routing arrays and invokes Functions only for the API', () => {
    // Vite copies this verbatim to dist. Pages requires exclude even when empty.
    const routes = JSON.parse(routesJSON);

    expect(routes).toEqual({
      version: 1,
      include: ['/api/*'],
      exclude: [],
    });
  });
});
