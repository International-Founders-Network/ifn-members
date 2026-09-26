# IFN Members — Neon notes

Shared Neon project with the landing site (`memberships` and other landing tables).

## Members-owned tables

- `library_assets` — per-slug Pack A download gate (`downloadable`, default `false`).
  See `migrations/01_library_assets.sql`. The members app also ensures the table
  exists on first Admin Library / download check (`CREATE TABLE IF NOT EXISTS`).

Toggle values do **not** require the PDF to exist on R2.
