# IFN Members — Neon notes

Shared Neon project with the landing site (`memberships` and other landing tables).

## Members-owned tables

- `library_assets` — per-slug Pack A surface flags, all default `false`
  (missing row = all off):
  - `downloadable` — member full download (`01_library_assets.sql`)
  - `teaser_public` — landing teaser download (`02_library_assets_teaser_public.sql`)
  - `landing_full` — landing full download (`03_library_assets_landing_full.sql`)

  The members app also ensures the table and columns exist on first Admin Library /
  download check (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`).

Admin Library also **seeds** a row (all flags `false`, `updated_by` NULL) for every
slug discovered on R2 under `pack-a/` or `pack-a/teasers/` (`INSERT … ON CONFLICT DO
NOTHING`, never overwrites flags). A Neon row is what makes a non–Pack A slug "known"
to the flag, preview and download routes.

Toggle values do **not** require the PDF to exist on R2.
