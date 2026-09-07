/**
 * Role resolution.
 *
 * `ADMIN_USER_IDS` / `MODERATOR_USER_IDS` are the operator's escape hatch and
 * always win over the `users.role` column, so a compromised write to the
 * table cannot mint an administrator. Nothing the client sends is involved.
 *
 * Lives in its own module so both the auth middleware and profile
 * serialization report the *same* role for a given account.
 */
export type Role = 'listener' | 'moderator' | 'admin';

function envRoleFor(userId: string): 'admin' | 'moderator' | null {
  const admins = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (admins.includes(userId)) return 'admin';
  const mods = (process.env.MODERATOR_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (mods.includes(userId)) return 'moderator';
  return null;
}

export function effectiveRole(userId: string, storedRole: Role): Role {
  const envRole = envRoleFor(userId);
  if (envRole === 'admin') return 'admin';
  if (envRole === 'moderator') return storedRole === 'admin' ? 'admin' : 'moderator';
  return storedRole;
}
