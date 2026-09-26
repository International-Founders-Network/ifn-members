import { getSql } from "@/lib/db";
import { PACK_A } from "@/lib/library-catalog";

export type LibraryAssetRow = {
  slug: string;
  downloadable: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

let ensured = false;

/**
 * Ensure library_assets exists (idempotent). Safe to call often.
 * Missing row for a catalog slug means downloadable = false (default OFF).
 */
export async function ensureLibraryAssetsTable(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS library_assets (
      slug TEXT PRIMARY KEY,
      downloadable BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;
  ensured = true;
}

/** Reset memo for tests. */
export function resetLibraryAssetsEnsureFlag(): void {
  ensured = false;
}

/**
 * Whether a catalog slug may be downloaded.
 * Default OFF when no row / DB missing / lookup fails (fail closed for downloads).
 */
export async function isLibraryItemDownloadable(slug: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT downloadable
      FROM library_assets
      WHERE slug = ${slug}
      LIMIT 1
    `) as Array<{ downloadable: boolean }>;

    if (rows.length === 0) return false;
    return Boolean(rows[0].downloadable);
  } catch (error) {
    console.error(
      "library_assets downloadable lookup failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

/** Map of slug → downloadable for all Pack A items (missing = false). */
export async function getLibraryDownloadFlags(): Promise<Record<string, boolean>> {
  const flags: Record<string, boolean> = {};
  for (const item of PACK_A) {
    flags[item.slug] = false;
  }

  const sql = getSql();
  if (!sql) return flags;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT slug, downloadable
      FROM library_assets
    `) as Array<{ slug: string; downloadable: boolean }>;

    for (const row of rows) {
      if (row.slug in flags) {
        flags[row.slug] = Boolean(row.downloadable);
      }
    }
  } catch (error) {
    console.error(
      "library_assets list failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return flags;
}

export async function listLibraryAssetsForAdmin(): Promise<
  Array<{
    slug: string;
    title: string;
    description: string;
    objectKey: string;
    downloadable: boolean;
    updated_at: string | null;
    updated_by: string | null;
  }>
> {
  const sql = getSql();
  const bySlug = new Map<string, LibraryAssetRow>();

  if (sql) {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT slug, downloadable, updated_at, updated_by
      FROM library_assets
    `) as LibraryAssetRow[];
    for (const row of rows) {
      bySlug.set(row.slug, row);
    }
  }

  return PACK_A.map((item) => {
    const row = bySlug.get(item.slug);
    return {
      slug: item.slug,
      title: item.title,
      description: item.description,
      objectKey: item.objectKey,
      downloadable: row ? Boolean(row.downloadable) : false,
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    };
  });
}

/**
 * Upsert downloadable flag. Does not touch R2; PDF need not exist.
 */
export async function setLibraryItemDownloadable(
  slug: string,
  downloadable: boolean,
  updatedBy: string | null,
): Promise<LibraryAssetRow> {
  const sql = getSql();
  if (!sql) {
    throw new Error("database_not_configured");
  }

  if (!PACK_A.some((item) => item.slug === slug)) {
    throw new Error("unknown_slug");
  }

  await ensureLibraryAssetsTable();

  const rows = (await sql`
    INSERT INTO library_assets (slug, downloadable, updated_at, updated_by)
    VALUES (${slug}, ${downloadable}, NOW(), ${updatedBy})
    ON CONFLICT (slug) DO UPDATE SET
      downloadable = EXCLUDED.downloadable,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
    RETURNING slug, downloadable, updated_at, updated_by
  `) as LibraryAssetRow[];

  return rows[0];
}
