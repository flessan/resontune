/**
 * The legal surface: /privacy, /terms and /copyright.
 *
 * These pages exist for people who are not signed in — often people
 * deciding whether to sign in at all — so the tests render them with no
 * auth state, no API and no player, and check that the substance is
 * actually there rather than a placeholder.
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Privacy from '@/pages/legal/Privacy';
import Terms from '@/pages/legal/Terms';
import Copyright from '@/pages/legal/Copyright';
import { Footer } from '@/components/Footer';

/* A legal page that needs the API is a legal page that breaks when the API
   does. Nothing here may call it. */
const apiGet = vi.fn(async () => ({}));
vi.mock('@/lib/api', () => ({
  api: { get: () => apiGet(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));

const renderPage = (node: React.ReactNode) =>
  render(<MemoryRouter>{node}</MemoryRouter>);

describe('legal pages', () => {
  it('renders the privacy page without an account or an API', () => {
    renderPage(<Privacy />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy');
    expect(apiGet).not.toHaveBeenCalled();
    // the substance, not just a title
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    for (const heading of [
      'What an account stores',
      'What stays in your browser',
      'Third parties',
      'How long things are kept',
      'Your data, your controls',
    ]) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeTruthy();
    }
  });

  it('describes the real processors and the real storage keys', () => {
    const { container } = renderPage(<Privacy />);
    const text = container.textContent ?? '';
    for (const claim of ['Neon Auth', 'ImgBB', 'resontune-local', 'resontune-settings']) {
      expect(text).toContain(claim);
    }
    // and does not claim things this app does not do
    expect(text).toMatch(/no advertising|There is no advertising/i);
    expect(text).toContain('sets no cookies');
    expect(text.toLowerCase()).not.toContain('gdpr compliant');
  });

  it('describes account deletion as two separate things', () => {
    const { container } = renderPage(<Privacy />);
    const text = container.textContent ?? '';
    // the ResonTune half
    expect(text).toMatch(/Your ResonTune data\s*is deleted outright/);
    // the Neon Auth half, without pretending it always succeeds
    expect(text).toMatch(/asks Neon Auth to delete that identity/);
    expect(text).toMatch(/whether that request is allowed|self-service deletion is not enabled/);
    expect(text).toMatch(/brand-new,\s*empty ResonTune account/);
    // and the promise it must not make
    expect(text).not.toMatch(/permanently erased everywhere|deleted from all backups/i);
  });

  it('distinguishes anonymous play counts from personal listening history', () => {
    const { container } = renderPage(<Privacy />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/no user column, no session id and no IP address/);
    expect(text).toMatch(/additionally\s*writes a row to your own\s*listening history/);
    expect(text).toMatch(/anonymous counter rows stay/);
  });

  it('does not claim compliance with any legal regime', () => {
    for (const page of [<Privacy key="p" />, <Terms key="t" />, <Copyright key="c" />]) {
      const { container, unmount } = renderPage(page);
      const text = (container.textContent ?? '').toLowerCase();
      for (const claim of ['gdpr compliant', 'fully compliant', 'ccpa compliant', 'legally compliant', 'certified']) {
        expect(text, claim).not.toContain(claim);
      }
      expect(text).not.toMatch(/we guarantee/);
      unmount();
    }
    const { container } = renderPage(<Privacy />);
    expect(container.textContent).toMatch(/depend on the\s*jurisdiction|matter for that operator/i);
  });

  it('is honest about where catalog audio actually lives', () => {
    const { container } = renderPage(<Copyright />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Linked recordings/);
    expect(text).toMatch(/ResonTune Originals and hosted community releases/);
    expect(text).toMatch(/only case in which ResonTune stores audio/);
  });

  it('renders the terms, including the absence of payments', () => {
    const { container } = renderPage(<Terms />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terms of use');
    const text = container.textContent ?? '';
    expect(text).toContain('does not process payments');
    expect(screen.getByRole('heading', { name: 'Acceptable use', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Music and rights holders', level: 2 })).toBeTruthy();
  });

  it('renders the music-rights policy with the real catalog fields', () => {
    const { container } = renderPage(<Copyright />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Music rights & copyright');
    const text = container.textContent ?? '';
    for (const field of ['License', 'Rights holder', 'Attribution text', 'Streaming permission', 'Territory']) {
      expect(text).toContain(field);
    }
    expect(text).toContain('does not own the music it lists');
    // no invented service-level promise
    expect(text).not.toMatch(/within \d+ (hours|business days)/i);
  });

  it('cross-links the three documents from each of them', () => {
    for (const page of [<Privacy key="p" />, <Terms key="t" />, <Copyright key="c" />]) {
      const { container, unmount } = renderPage(page);
      const nav = container.querySelector('.legal-nav')!;
      const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/privacy');
      expect(hrefs).toContain('/terms');
      expect(hrefs).toContain('/copyright');
      unmount();
    }
  });

  it('is reachable from the footer on every page', () => {
    const { container } = render(<MemoryRouter><Footer /></MemoryRouter>);
    const nav = within(container.querySelector('nav')!);
    expect(nav.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(nav.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(nav.getByRole('link', { name: 'Music rights' }).getAttribute('href')).toBe('/copyright');
  });
});
