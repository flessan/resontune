/**
 * Deleting the *sign-in identity* at Neon Auth, from the server.
 *
 * Two mechanisms exist, and they are not interchangeable:
 *
 *  1. Better Auth's self-service `POST {NEON_AUTH_URL}/delete-user`, which is
 *     authenticated by the user's own Neon Auth session. Only the browser
 *     holds that session, so only the browser can call it - and it works
 *     only when the deployment enabled `user.deleteUser`.
 *
 *  2. The documented Neon control-plane endpoint
 *     `DELETE /projects/{project_id}/branches/{branch_id}/auth/users/{auth_user_id}`
 *     (beta), authenticated with a Neon API key. That is what this module
 *     speaks, so a deletion is not left half-done when the browser path is
 *     unavailable.
 *
 * The credential this needs is powerful. It is therefore:
 *   - read from the server environment only, never sent to a client, never
 *     logged, never echoed in an API response;
 *   - entirely optional - with nothing configured the app keeps its previous
 *     honest behaviour and says the identity was not deleted;
 *   - best paired with a *project-scoped* Neon API key, which cannot reach
 *     any other project, cannot create projects and cannot mint more keys.
 *
 * Nothing here guesses an endpoint: the URL, the method and the 204 response
 * are the documented contract, and every other status is reported as the
 * failure it is rather than being smoothed into success.
 */

/** What the server managed to do about the identity itself. */
export type IdentityAdminStatus =
  | 'deleted'          // the provider confirmed the identity is gone
  | 'already-absent'   // the provider has no such user (or the ids point elsewhere)
  | 'not-configured'   // no Neon API credentials on this deployment
  | 'unauthorized'     // the key is wrong, expired, or lacks access to the project
  | 'failed';          // the provider refused or was unreachable

export interface IdentityAdminResult {
  status: IdentityAdminStatus;
  /** True only when the provider actually confirmed the deletion. */
  deleted: boolean;
  /** Plain-language detail, safe to show a user. Never contains credentials. */
  detail: string;
}

interface AdminConfig {
  apiKey: string;
  projectId: string;
  branchId: string;
  base: string;
}

/** Read at call time so a test (or a reload) can change the environment. */
function readConfig(): AdminConfig | null {
  const apiKey = (process.env.NEON_API_KEY ?? '').trim();
  const projectId = (process.env.NEON_PROJECT_ID ?? '').trim();
  const branchId = (process.env.NEON_BRANCH_ID ?? '').trim();
  if (!apiKey || !projectId || !branchId) return null;
  const base = (process.env.NEON_API_BASE ?? 'https://console.neon.tech/api/v2').replace(/\/+$/, '');
  return { apiKey, projectId, branchId, base };
}

/** Whether this deployment can delete identities server-side at all. */
export function identityAdminConfigured(): boolean {
  return readConfig() !== null;
}

/** Why the browser must still ask, when the server cannot. */
export const NOT_CONFIGURED_DETAIL =
  'This deployment holds no Neon administrative credential, so the server cannot delete the '
  + 'sign-in identity for you.';

const TIMEOUT_MS = 8_000;

/** A short, non-sensitive summary of a provider error body. */
async function describeError(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 400);
    if (!text) return `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { message?: unknown };
      if (typeof body.message === 'string' && body.message) {
        return `HTTP ${res.status}: ${body.message.slice(0, 200)}`;
      }
    } catch {
      /* not JSON - fall through */
    }
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Ask Neon to delete one auth user. `subject` is the Neon Auth user id - the
 * verified `sub` claim ResonTune already stores as `users.auth_subject`.
 */
export async function deleteNeonAuthIdentity(subject: string): Promise<IdentityAdminResult> {
  const cfg = readConfig();
  if (!cfg) return { status: 'not-configured', deleted: false, detail: NOT_CONFIGURED_DETAIL };
  if (!subject) {
    return { status: 'already-absent', deleted: false, detail: 'No sign-in identity was linked to this account.' };
  }

  const url =
    `${cfg.base}/projects/${encodeURIComponent(cfg.projectId)}`
    + `/branches/${encodeURIComponent(cfg.branchId)}`
    + `/auth/users/${encodeURIComponent(subject)}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${cfg.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 204 || res.status === 200) {
      return {
        status: 'deleted',
        deleted: true,
        detail: 'Neon Auth confirmed your sign-in identity has been deleted.',
      };
    }
    if (res.status === 404) {
      return {
        status: 'already-absent',
        deleted: false,
        detail:
          'Neon Auth reported no such user. It may already have been deleted - or this '
          + 'deployment is pointed at the wrong Neon project or branch.',
      };
    }
    if (res.status === 401 || res.status === 403) {
      // Operator-facing, no key material: this is a configuration fault.
      console.error('[auth] Neon identity deletion rejected the configured API key', res.status);
      return {
        status: 'unauthorized',
        deleted: false,
        detail: 'Neon rejected this deployment’s administrative credential, so the identity was not deleted.',
      };
    }
    const detail = await describeError(res);
    console.error('[auth] Neon identity deletion failed:', detail);
    return { status: 'failed', deleted: false, detail: `Neon Auth refused the deletion (${detail}).` };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'was unreachable';
    console.error('[auth] Neon identity deletion error:', reason);
    return {
      status: 'failed',
      deleted: false,
      detail: `The identity provider ${reason}, so your sign-in identity was not deleted.`,
    };
  }
}
