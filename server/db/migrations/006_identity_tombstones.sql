-- 006 - durable account-deletion tombstones.
--
-- Accounts are created on the first verified request, which is convenient
-- until someone deletes theirs: a JWT is stateless and stays valid until it
-- expires, so a tab still holding one would recreate an empty account and
-- make "deleted" a lie. The refusal used to live in the deleting process's
-- memory, which only covers a single instance.
--
-- This table is that refusal, shared by every instance through the database
-- that is already there. It holds no personal data: the opaque provider
-- subject (the same value already stored in users.auth_subject), the moment
-- the account was deleted, and the moment the record itself may be dropped.
-- Rows are self-expiring - a token issued before the deletion cannot outlive
-- its own expiry, so the tombstone only has to cover that window.
--
-- Additive and safe on existing deployments: nothing else is touched.

CREATE TABLE IF NOT EXISTS deleted_identities (
  auth_provider TEXT        NOT NULL,
  auth_subject  TEXT        NOT NULL,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (auth_provider, auth_subject)
);

-- The hot lookup is the primary key (provider, subject); this one only
-- supports the cheap sweep of expired rows.
CREATE INDEX IF NOT EXISTS deleted_identities_expires_idx ON deleted_identities (expires_at);
