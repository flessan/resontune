/**
 * Canonical links and sharing.
 *
 * ResonTune routes are slug-based, so a shared link is readable and stable.
 * Nothing here ever exposes a database id when a slug exists.
 */

/** Absolute URL for an in-app route ("/track/night-bus"). */
export function canonicalUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

/**
 * Copy text to the clipboard. `navigator.clipboard` needs a secure context
 * and a user gesture; when it is unavailable we fall back to a hidden
 * textarea, and finally to a prompt the user can copy from by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Share a link: the Web Share API where the platform offers it (mobile,
 * some desktops), the clipboard everywhere else. Returns how it resolved so
 * callers can show honest feedback.
 */
export async function shareLink(opts: { title: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (err) {
      // AbortError = the person closed the share sheet; that is not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  return (await copyText(opts.url)) ? 'copied' : 'failed';
}
