-- Pack A "landing full" flag: landing may offer the FULL PDF publicly (no sign-in).
-- Independent of downloadable ("member on") and teaser_public ("teaser on").
-- Defaults FALSE; missing row = all three off. Off always wins for that surface.
-- App also runs this ALTER in ensureLibraryAssetsTable() so Netlify works without a manual migrate.

ALTER TABLE library_assets
  ADD COLUMN IF NOT EXISTS landing_full BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS library_assets_landing_full_idx
  ON library_assets (landing_full);
