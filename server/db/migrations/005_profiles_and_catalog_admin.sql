-- 005: user profiles, normalized external links, catalog administration
--
-- 1. Real user profiles live on the existing `users` row (no parallel
--    `profiles` table): bio, location, website and avatar metadata. Avatar
--    images are hosted by ImgBB - only the resulting URLs/identifier are
--    stored here, never image bytes.
-- 2. External links become one normalized table (`entity_links`) shared by
--    users, artists, releases and tracks, replacing `artist_links`. Existing
--    artist link rows are migrated, not dropped.
-- 3. Catalog entities gain the metadata the web catalog manager needs:
--    artist publication state, an optional link from an artist record to a
--    ResonTune account (claiming, later), and updated_at timestamps for the
--    "recently modified" view.
--
-- Incremental and idempotent: safe on databases created from 001–004.

-- ─── user profiles ───────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio                TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_thumb_url   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_provider_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- avatar_source records where the current avatar came from:
--   imgbb = uploaded by the user through ResonTune → ImgBB
--   auth  = the picture claim supplied by Neon Auth at first sign-in
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_source_check;
ALTER TABLE users ADD CONSTRAINT users_avatar_source_check
  CHECK (avatar_source IS NULL OR avatar_source IN ('imgbb', 'auth'));

-- Usernames are stored normalized (lowercase). Only rewrite rows where doing
-- so cannot collide with an existing handle.
UPDATE users u SET handle = lower(u.handle)
 WHERE u.handle <> lower(u.handle)
   AND NOT EXISTS (SELECT 1 FROM users o WHERE o.id <> u.id AND o.handle = lower(u.handle));

CREATE INDEX IF NOT EXISTS users_handle_lower_idx ON users (lower(handle));

-- ─── normalized external links ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_links (
  id          UUID PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('user', 'artist', 'album', 'track')),
  entity_id   UUID NOT NULL,
  provider    TEXT NOT NULL DEFAULT 'website',
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_links_entity_idx ON entity_links (entity_kind, entity_id, position);

INSERT INTO entity_links (id, entity_kind, entity_id, provider, label, url, position)
  SELECT al.id, 'artist', al.artist_id, al.kind, al.label, al.url, 0
    FROM artist_links al
   WHERE EXISTS (SELECT 1 FROM artists a WHERE a.id = al.artist_id)
  ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS artist_links;

-- ─── catalog administration metadata ────────────────────────────────────────

ALTER TABLE artists ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE artists DROP CONSTRAINT IF EXISTS artists_status_check;
ALTER TABLE artists ADD CONSTRAINT artists_status_check
  CHECK (status IN ('published', 'unlisted', 'taken_down', 'archived'));

-- An artist record may optionally reference a ResonTune account. Independent
-- artists without an account stay fully supported (user_id IS NULL).
ALTER TABLE artists ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE artists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE albums  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tracks  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS artists_status_idx  ON artists (status);
CREATE INDEX IF NOT EXISTS artists_user_idx    ON artists (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS artists_updated_idx ON artists (updated_at DESC);
CREATE INDEX IF NOT EXISTS albums_updated_idx  ON albums (updated_at DESC);
CREATE INDEX IF NOT EXISTS tracks_updated_idx  ON tracks (updated_at DESC);
