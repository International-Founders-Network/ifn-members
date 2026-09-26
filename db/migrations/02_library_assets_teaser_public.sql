-- Pack A "teaser on" flag (landing may offer a teaser download/link — later).
-- downloadable = "member on" (entitled members get the full PDF on members.ifn.community).
-- Both default FALSE; missing row = both off. Off always wins for that surface.
-- Teaser objects will live at pack-a/teasers/<slug>.pdf (not published by this app yet).
-- App also runs this ALTER in ensureLibraryAssetsTable() so Netlify works without a manual migrate.

ALTER TABLE library_assets
  ADD COLUMN IF NOT EXISTS teaser_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS library_assets_teaser_public_idx
  ON library_assets (teaser_public);
