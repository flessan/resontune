/**
 * Thin fetch wrapper for the ResonTune API. Relative URLs only.
 * Attaches the Neon Auth bearer token when a session exists — the server
 * verifies it cryptographically; anonymous requests simply omit it.
 */
import { getToken } from './authClient';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    // Human copy in the UI; status codes and bodies go to the console only.
    let message =
      res.status === 404 ? 'This page or item is no longer available.'
      : res.status === 410 ? 'This content has been removed.'
      : res.status === 429 ? 'You’re doing that a little too fast. Give it a moment and try again.'
      : res.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.'
      : 'That didn’t work. Please try again.';
    try {
      const body = await res.json();
      if (body?.error && res.status < 500) message = body.error;
    } catch { /* keep default */ }
    console.warn(`[api] ${init?.method ?? 'GET'} ${path} → ${res.status}`);
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
