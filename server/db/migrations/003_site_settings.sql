-- 003: site settings
--
-- A tiny key/value store for public, admin-controlled configuration —
-- support links, QRIS asset URL, curated supporter names. Deliberately not
-- a CMS: one table, JSONB values, full audit via updated_at/updated_by.
-- Secrets never live here; everything in this table is publicly readable.

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
