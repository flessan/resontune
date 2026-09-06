/**
 * ImgBB — the one and only image host ResonTune uploads to, and only for
 * user profile photos.
 *
 * Flow: browser → this server → ImgBB → resulting URL saved in Neon.
 *
 * The API key lives exclusively in the server environment (IMGBB_API_KEY).
 * It is never sent to the browser, never embedded in a client bundle and
 * never returned in an API response. The browser only ever learns the
 * resulting public image URL.
 *
 * Catalog audio and album artwork are deliberately NOT uploaded here — an
 * administrator hosts those elsewhere and pastes verified direct URLs.
 */

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type AvatarMime = (typeof AVATAR_ALLOWED_MIME)[number];

export function imgbbConfigured(): boolean {
  return Boolean(process.env.IMGBB_API_KEY);
}

/**
 * Identify an image by its magic bytes. Never trust the declared
 * Content-Type alone — this is what stops "image/png" wrappers around
 * arbitrary payloads.
 */
export function sniffImageMime(buf: Buffer): AvatarMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.subarray(0, 6).toString('latin1') === 'GIF89a' || buf.subarray(0, 6).toString('latin1') === 'GIF87a') {
    return 'image/gif';
  }
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export interface ImgbbResult {
  /** Public direct image URL — this is what we persist. */
  url: string;
  /** Smaller variant when ImgBB produced one. */
  thumbUrl: string | null;
  /** ImgBB's identifier for the image (useful for future housekeeping). */
  id: string | null;
}

export class ImgbbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Upload image bytes to ImgBB and return the hosted URLs.
 *
 * The request goes to a fixed, hard-coded endpoint — no user input decides
 * where the server connects, so this is not an SSRF vector.
 */
export async function uploadAvatarToImgbb(bytes: Buffer, name: string): Promise<ImgbbResult> {
  const key = process.env.IMGBB_API_KEY;
  if (!key) throw new ImgbbError(503, 'Profile photo uploads are not configured on this deployment.');
  if (!bytes.length) throw new ImgbbError(400, 'The uploaded file was empty.');
  if (bytes.length > AVATAR_MAX_BYTES) throw new ImgbbError(413, 'Image is larger than 4 MB.');

  const body = new URLSearchParams();
  body.set('key', key);
  body.set('image', bytes.toString('base64'));
  body.set('name', name.slice(0, 60));

  let res: Response;
  try {
    res = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ImgbbError(502, 'Could not reach the image host. Try again in a moment.');
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* fall through to the generic error below */
  }

  if (!res.ok || !payload?.success || !payload?.data?.url) {
    // Never surface ImgBB's raw response — it can echo request details.
    const detail = typeof payload?.error?.message === 'string' ? payload.error.message : '';
    console.warn('[imgbb] upload rejected', res.status, detail);
    throw new ImgbbError(502, 'The image host rejected that file. Try a different image.');
  }

  const data = payload.data;
  return {
    url: String(data.display_url ?? data.url),
    thumbUrl: typeof data.thumb?.url === 'string' ? data.thumb.url : null,
    id: typeof data.id === 'string' ? data.id : null,
  };
}
