-- ResonTune schema
-- Runs on Neon Postgres in production and on embedded PGlite in development.
-- Audio binaries are NEVER stored here; track_sources reference external
-- storage (manual URLs today, S3/R2/object storage later).

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  handle        TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'listener'
                CHECK (role IN ('listener','moderator','admin')),
  auth_provider TEXT NOT NULL DEFAULT 'dev'
                CHECK (auth_provider IN ('dev','github','neon')),
  auth_subject  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_idx
  ON users (auth_provider, auth_subject)
  WHERE auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS licenses (
  id                   TEXT PRIMARY KEY,          -- e.g. 'cc-by-4.0'
  name                 TEXT NOT NULL,
  url                  TEXT,
  summary              TEXT,
  requires_attribution BOOLEAN NOT NULL DEFAULT true,
  allows_streaming     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS artists (
  id         UUID PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  bio        TEXT,
  image_url  TEXT,
  location   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artists_name_idx ON artists (lower(name));

CREATE TABLE IF NOT EXISTS artist_links (
  id        UUID PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                        -- bandcamp | kofi | patreon | website | social
  label     TEXT NOT NULL,
  url       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artist_links_artist_idx ON artist_links (artist_id);

CREATE TABLE IF NOT EXISTS albums (
  id          UUID PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  artist_id   UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'album'
              CHECK (type IN ('album','ep','single','compilation')),
  artwork_url TEXT,
  description TEXT,
  released_on DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS albums_artist_idx ON albums (artist_id);
CREATE INDEX IF NOT EXISTS albums_released_idx ON albums (released_on DESC);
CREATE INDEX IF NOT EXISTS albums_title_idx ON albums (lower(title));

CREATE TABLE IF NOT EXISTS tracks (
  id               UUID PRIMARY KEY,
  slug             TEXT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  artist_id        UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  album_id         UUID REFERENCES albums(id) ON DELETE SET NULL,
  track_no         INTEGER,
  duration_seconds INTEGER,
  artwork_url      TEXT,
  description      TEXT,
  license_id       TEXT REFERENCES licenses(id),
  rights_holder    TEXT,
  credits          TEXT,
  explicit         BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published','hidden','removed')),
  play_count       BIGINT NOT NULL DEFAULT 0,
  like_count       BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracks_artist_idx ON tracks (artist_id);
CREATE INDEX IF NOT EXISTS tracks_album_idx ON tracks (album_id);
CREATE INDEX IF NOT EXISTS tracks_title_idx ON tracks (lower(title));
CREATE INDEX IF NOT EXISTS tracks_plays_idx ON tracks (play_count DESC);

-- A track may have multiple sources ranked by priority. `storage` records how
-- the bytes are managed so we can migrate manual URLs -> object storage later.
CREATE TABLE IF NOT EXISTS track_sources (
  id        UUID PRIMARY KEY,
  track_id  UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider  TEXT NOT NULL
            CHECK (provider IN ('hosted','local','youtube','soundcloud','other')),
  kind      TEXT NOT NULL DEFAULT 'direct_url'
            CHECK (kind IN ('direct_url','embed','external_link')),
  url       TEXT NOT NULL,
  mime_type TEXT,
  storage   TEXT NOT NULL DEFAULT 'manual-url',  -- manual-url | s3 | r2 | neon-object | external
  priority  INTEGER NOT NULL DEFAULT 0,
  meta      JSONB
);
CREATE INDEX IF NOT EXISTS track_sources_track_idx ON track_sources (track_id, priority);

CREATE TABLE IF NOT EXISTS lyrics (
  track_id UUID PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  body     TEXT NOT NULL,
  kind     TEXT NOT NULL DEFAULT 'plain',
  language TEXT NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS genres (
  id   TEXT PRIMARY KEY,   -- slug
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS track_genres (
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, genre_id)
);
CREATE INDEX IF NOT EXISTS track_genres_genre_idx ON track_genres (genre_id);

CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS track_tags (
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, tag_id)
);
CREATE INDEX IF NOT EXISTS track_tags_tag_idx ON track_tags (tag_id);

CREATE TABLE IF NOT EXISTS playlists (
  id          UUID PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = editorial/curated
  title       TEXT NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  is_curated  BOOLEAN NOT NULL DEFAULT false,
  like_count  BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playlists_owner_idx ON playlists (owner_id);
CREATE INDEX IF NOT EXISTS playlists_public_idx ON playlists (is_public) WHERE is_public;

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);
CREATE INDEX IF NOT EXISTS playlist_tracks_pos_idx ON playlist_tracks (playlist_id, position);

CREATE TABLE IF NOT EXISTS playlist_likes (
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS favorites_track_idx ON favorites (track_id);

CREATE TABLE IF NOT EXISTS play_history (
  id        UUID PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id  UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS play_history_user_idx ON play_history (user_id, played_at DESC);

-- Anonymous, aggregate play events used for trending / rising calculations.
CREATE TABLE IF NOT EXISTS play_events (
  id        UUID PRIMARY KEY,
  track_id  UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS play_events_track_idx ON play_events (track_id, played_at DESC);
CREATE INDEX IF NOT EXISTS play_events_time_idx ON play_events (played_at DESC);

CREATE TABLE IF NOT EXISTS submissions (
  id                 UUID PRIMARY KEY,
  submitter_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','reviewing','approved','rejected')),
  payload            JSONB NOT NULL,
  moderator_note     TEXT,
  reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  resulting_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions (submitter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_picks (
  track_id   UUID PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  note       TEXT,
  picked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
