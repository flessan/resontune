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
