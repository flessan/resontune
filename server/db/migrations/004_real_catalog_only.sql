-- 004: real catalog only
--
-- Retires the development-era demo scaffolding:
--   1. Deletes the generated launch catalog (fictional artists, generated
--      audio releases, curated demo collections/playlists) by their known
--      seed slugs. Cascades remove albums, tracks, sources, lyrics,
--      favorites, history and playlist references.
--   2. Drops the database-backed submission pipeline. Music intake now
--      happens through external community channels; only the published
--      catalog lives in the database. Takedowns/content-state auditing
--      stays — that is real catalog administration.
--   3. Drops server-side sessions and dev accounts. Authentication is now
--      Neon Auth (verified JWTs); ResonTune stores only its own user rows
--      keyed by the verified auth subject.
--   4. Seeds structural reference data (licenses) that the catalog schema
--      genuinely requires. No artists, albums, tracks, releases, audio
--      sources, collections or plays are seeded — the catalog is empty
--      until real music is published.

-- 1. demo catalog rows (cascade removes all dependent rows)
DELETE FROM artists WHERE slug IN (
  'marlow-ferris', 'cascadia-loom', 'ratri-tidewater', 'vera-lune',
  'the-halfday-union', 'glasshouse-tapes', 'kite-season'
);

DELETE FROM collections WHERE slug IN (
  'resontune-essentials', 'indonesian-independent', 'late-night-desk', 'free-to-share'
);

DELETE FROM playlists WHERE is_curated = true AND slug IN (
  'late-night-coding', 'indie-electronic-now', 'banjarmasin-indie', '3am-discoveries'
);

-- orphaned demo taxonomy rows stay harmless (UI hides empty genres/tags),
-- but demo play data must not survive as fake popularity
DELETE FROM play_events WHERE track_id NOT IN (SELECT id FROM tracks);
DELETE FROM play_history WHERE track_id NOT IN (SELECT id FROM tracks);
DELETE FROM community_picks WHERE track_id NOT IN (SELECT id FROM tracks);

-- 2. submission pipeline (intake moved to external community channels)
DROP TABLE IF EXISTS moderation_events;
DROP TABLE IF EXISTS submissions;

-- 3. session store + dev accounts (Neon Auth JWTs replace both)
DROP TABLE IF EXISTS sessions;
DELETE FROM users WHERE auth_provider = 'dev';

-- 4. structural reference data: licenses the rights-aware catalog uses.
--    These are legal vocabulary, not content.
INSERT INTO licenses (id, name, url, summary, requires_attribution) VALUES
  ('cc0-1.0', 'CC0 1.0 (Public Domain)', 'https://creativecommons.org/publicdomain/zero/1.0/', 'No rights reserved. Free to use for any purpose.', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO licenses (id, name, url, summary, requires_attribution) VALUES
  ('cc-by-4.0', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', 'Free to share and adapt with attribution.', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO licenses (id, name, url, summary, requires_attribution) VALUES
  ('cc-by-sa-4.0', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'Attribution + share-alike.', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO licenses (id, name, url, summary, requires_attribution) VALUES
  ('cc-by-nc-4.0', 'CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/', 'Attribution, non-commercial use only.', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO licenses (id, name, url, summary, requires_attribution) VALUES
  ('all-rights-reserved', 'All rights reserved', NULL, 'Streaming permitted on ResonTune with the rights holder''s permission. No redistribution.', true)
  ON CONFLICT (id) DO NOTHING;
