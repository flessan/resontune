/**
 * Profile serialization shared by the account (`/api/me`) and public
 * (`/api/users/:username`) surfaces.
 *
 * Only fields that are safe to publish leave this module: no auth subject,
 * no provider identifiers, no email. The avatar is a URL hosted by ImgBB
 * (or the picture Neon Auth supplied at first sign-in); ResonTune stores no
 * image bytes.
 */
import type { EntityLink } from '../db/links.ts';
import { effectiveRole } from './roles.ts';

export const PROFILE_COLUMNS = `u.id, u.handle, u.display_name, u.avatar_url, u.avatar_thumb_url,
  u.bio, u.location, u.website_url, u.role, u.created_at, u.updated_at`;

export interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  role: 'listener' | 'moderator' | 'admin';
  created_at: string;
  updated_at?: string | null;
}

export function serializeProfile(row: ProfileRow, links: EntityLink[] = []) {
  return {
    id: row.id,
    username: row.handle,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    avatarThumbUrl: row.avatar_thumb_url,
    bio: row.bio,
    location: row.location,
    websiteUrl: row.website_url,
    // Reported through the same resolver the middleware uses, so an
    // env-granted admin never looks like a listener on their own profile.
    role: effectiveRole(row.id, row.role),
    joinedAt: row.created_at,
    createdAt: row.created_at,
    links: links.map((l) => ({ provider: l.provider, label: l.label, url: l.url })),
  };
}

export type PublicProfile = ReturnType<typeof serializeProfile>;
