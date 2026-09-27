# IFN Members — Neon notes

Shared Neon project with the landing site (`memberships` and other landing tables).

## Members-owned tables

- `library_assets` — per-slug library surface flags, all default `false`
  (missing row = all off):
  - `downloadable` — member full download (`01_library_assets.sql`)
  - `teaser_public` — landing teaser download (`02_library_assets_teaser_public.sql`)
  - `landing_full` — landing full download (`03_library_assets_landing_full.sql`)

  The members app also ensures the table and columns exist on first Admin Library /
  download check (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`).

`slug` is always the bare slug (`visa-pathways`), never the R2 serial folder
(`001-visa-pathways`). R2 keys are `library/<NNN>-<slug>/v1.1-member-<slug>.pdf`,
`v1.1-teaser-<slug>.pdf` and `v1.1-<slug>.xlsx`; serials live in `src/lib/library-serials.ts` and
`docs/library-r2-key-map.json` (see the root README).

Admin Library also **seeds** a row (all flags `false`, `updated_by` NULL) for every
registry serial (108) and every slug discovered on R2 under `library/<NNN>-<slug>/`
(`INSERT … ON CONFLICT DO NOTHING`, never overwrites flags). Registry slugs are always
"known"; for any other slug, a Neon row is what makes it known to the flag, preview and
download routes.

Toggle values do **not** require the PDF to exist on R2.
