-- 002: ResonTune product model
--
-- Provenance (source_type), content lifecycle states, a real rights model,
-- collections, submission→catalog linkage with moderation history, and a
-- storage-ready track_sources shape. Written as incremental ALTERs so it
-- applies cleanly to databases created from 001 (Neon or PGlite).

-- ─── provenance ──────────────────────────────────────────────────────────────
-- Every catalog entity carries an explicit origin. ORIGINAL = released and
-- distributed by ResonTune with the necessary rights. COMMUNITY = published
-- from a verified community submission. EXTERNAL = discovery surface only.

ALTER TABLE artists ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'community';
ALTER TABLE artists DROP CONSTRAINT IF EXISTS artists_source_type_check;
ALTER TABLE artists ADD CONSTRAINT artists_source_type_check
  CHECK (source_type IN ('original','community','external'));

ALTER TABLE albums ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'community';
ALTER TABLE albums DROP CONSTRAINT IF EXISTS albums_source_type_check;
ALTER TABLE albums ADD CONSTRAINT albums_source_type_check
  CHECK (source_type IN ('original','community','external'));

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'community';
ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_source_type_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_source_type_check
  CHECK (source_type IN ('original','community','external'));
CREATE INDEX IF NOT EXISTS tracks_source_type_idx ON tracks (source_type);
CREATE INDEX IF NOT EXISTS albums_source_type_idx ON albums (source_type);

-- ─── content lifecycle ───────────────────────────────────────────────────────
-- published  : normal playback + discovery
-- unlisted   : direct link works, hidden from discovery/search
-- taken_down : blocked from playback/discovery, metadata retained for audit
-- archived   : retired by rights holder/admin, metadata retained

UPDATE tracks SET status = 'unlisted'   WHERE status = 'hidden';
UPDATE tracks SET status = 'taken_down' WHERE status = 'removed';
ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_status_check
  CHECK (status IN ('published','unlisted','taken_down','archived'));

ALTER TABLE albums ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE albums DROP CONSTRAINT IF EXISTS albums_status_check;
ALTER TABLE albums ADD CONSTRAINT albums_status_check
  CHECK (status IN ('published','unlisted','taken_down','archived'));

-- takedown audit trail (never deleted when content is taken down)
CREATE TABLE IF NOT EXISTS takedowns (
  id          UUID PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('track','album','artist')),
  entity_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  requested_by TEXT,                     -- e.g. 'rights holder', 'moderation'
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takedowns_entity_idx ON takedowns (entity_kind, entity_id);

-- ─── rights model ────────────────────────────────────────────────────────────
-- Rights are recorded, never invented. distribution/streaming permissions are
-- explicit booleans set at publication time; territory defaults to worldwide.

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS attribution_text        TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS distribution_permission BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS streaming_permission    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS territory               TEXT NOT NULL DEFAULT 'worldwide';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS rights_notes            TEXT;

-- ─── track sources / storage abstraction ────────────────────────────────────
-- source_type describes how ResonTune manages the bytes:
--   original_hosted  : ResonTune Originals audio (object storage / CDN)
--   community_hosted : community audio ResonTune stores/serves
--   remote           : rights-holder-managed direct URL
--   external         : official embed / external playback only
-- object_key allows migrating url → object storage without schema changes.

ALTER TABLE track_sources ADD COLUMN IF NOT EXISTS source_type      TEXT NOT NULL DEFAULT 'remote';
ALTER TABLE track_sources DROP CONSTRAINT IF EXISTS track_sources_source_type_check;
ALTER TABLE track_sources ADD CONSTRAINT track_sources_source_type_check
  CHECK (source_type IN ('original_hosted','community_hosted','remote','external'));
ALTER TABLE track_sources ADD COLUMN IF NOT EXISTS object_key       TEXT;
ALTER TABLE track_sources ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE track_sources ADD COLUMN IF NOT EXISTS availability     TEXT NOT NULL DEFAULT 'available';
ALTER TABLE track_sources DROP CONSTRAINT IF EXISTS track_sources_availability_check;
ALTER TABLE track_sources ADD CONSTRAINT track_sources_availability_check
  CHECK (availability IN ('available','processing','unavailable'));

-- ─── collections (editorial layer) ───────────────────────────────────────────
-- Collections are not playlists: they hold tracks, albums AND artists with
-- editorial notes, and have their own publication lifecycle.

CREATE TABLE IF NOT EXISTS collections (
  id          UUID PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  curator_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  curator_name TEXT NOT NULL DEFAULT 'ResonTune Editorial',
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','published','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collections_status_idx ON collections (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  item_kind     TEXT NOT NULL CHECK (item_kind IN ('track','album','artist')),
  item_id       UUID NOT NULL,
  note          TEXT,
  PRIMARY KEY (collection_id, item_kind, item_id)
);
CREATE INDEX IF NOT EXISTS collection_items_pos_idx ON collection_items (collection_id, position);

-- ─── submissions: lifecycle + private moderation notes + catalog link ────────
-- Lifecycle: pending → reviewing → approved → published (or rejected).
-- moderator_note is shown to the submitter; internal_note never leaves the
-- moderation team. moderation_events keeps the full decision history.

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('pending','reviewing','approved','published','rejected'));
UPDATE submissions SET status = 'published'
  WHERE status = 'approved' AND resulting_track_id IS NOT NULL;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS internal_note TEXT;

CREATE TABLE IF NOT EXISTS moderation_events (
  id            UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  public_note   TEXT,
  internal_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_events_sub_idx ON moderation_events (submission_id, created_at);

-- ─── originals releases metadata ────────────────────────────────────────────
ALTER TABLE albums ADD COLUMN IF NOT EXISTS catalog_no TEXT;   -- e.g. RSN-001
