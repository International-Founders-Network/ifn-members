-- Library asset download gates for IFN Members Pack A.
-- Same Neon project as memberships. App also runs CREATE TABLE IF NOT EXISTS
-- on first admin/list use so toggles work without a manual migrate step.
-- downloadable defaults FALSE: members get no working download until Admin enables.

CREATE TABLE IF NOT EXISTS library_assets (
  slug TEXT PRIMARY KEY,
  downloadable BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS library_assets_downloadable_idx
  ON library_assets (downloadable);
