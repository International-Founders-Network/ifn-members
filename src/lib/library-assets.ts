import { getSql } from "@/lib/db";
import { PACK_A } from "@/lib/library-catalog";
import {
  defaultLibraryFlagsMap,
  type LibraryAssetFlags,
  type LibraryFlagsPatch,
} from "@/lib/library-flags";

/**
 * `downloadable` = "member on" (column name kept from PR #1).
 * `teaser_public` = "teaser on" (landing teaser only; never unlocks the full PDF).
 */
export type LibraryAssetRow = {
  slug: string;
  downloadable: boolean;
  teaser_public: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

let ensured = false;

/**
 * Ensure library_assets exists with all columns (idempotent). Safe to call often.
 * The ALTER covers DBs created by PR #1 before teaser_public existed.
 * Missing row for a catalog slug means both flags off.
 */
export async function ensureLibraryAssetsTable(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS library_assets (
      slug TEXT PRIMARY KEY,
      downloadable BOOLEAN NOT NULL DEFAULT FALSE,
      teaser_public BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;
  await sql`
    ALTER TABLE library_assets
      ADD COLUMN IF NOT EXISTS teaser_public BOOLEAN NOT NULL DEFAULT FALSE
  `;
  ensured = true;
}

/** Reset memo for tests. */
export function resetLibraryAssetsEnsureFlag(): void {
  ensured = false;
}

async function lookupFlag(
  slug: string,
  column: "downloadable" | "teaser_public",
): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT downloadable, teaser_public
      FROM library_assets
      WHERE slug = ${slug}
      LIMIT 1
    `) as Array<Pick<LibraryAssetRow, "downloadable" | "teaser_public">>;

    if (rows.length === 0) return false;
    return Boolean(rows[0][column]);
  } catch (error) {
    console.error(
      `library_assets ${column} lookup failed:`,
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

/**
 * Member on: whether entitled members may download the full PDF.
 * Default OFF when no row / DB missing / lookup fails (fail closed).
 */
export async function isLibraryItemDownloadable(slug: string): Promise<boolean> {
  return lookupFlag(slug, "downloadable");
}

/**
 * Teaser on: whether landing may offer the teaser. Fail closed.
 * Does not grant member full-PDF access.
 */
export async function isLibraryItemTeaserPublic(slug: string): Promise<boolean> {
  return lookupFlag(slug, "teaser_public");
}

/** Map of slug → { downloadable, teaserPublic } for all Pack A items (missing = both off). */
export async function getLibraryAssetFlags(): Promise<Record<string, LibraryAssetFlags>> {
  const flags = defaultLibraryFlagsMap();

  const sql = getSql();
  if (!sql) return flags;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT slug, downloadable, teaser_public
      FROM library_assets
    `) as Array<Pick<LibraryAssetRow, "slug" | "downloadable" | "teaser_public">>;

    for (const row of rows) {
      if (row.slug in flags) {
        flags[row.slug] = {
          downloadable: Boolean(row.downloadable),
          teaserPublic: Boolean(row.teaser_public),
        };
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
    teaserPublic: boolean;
    updated_at: string | null;
    updated_by: string | null;
  }>
> {
  const sql = getSql();
  const bySlug = new Map<string, LibraryAssetRow>();

  if (sql) {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT slug, downloadable, teaser_public, updated_at, updated_by
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
      teaserPublic: row ? Boolean(row.teaser_public) : false,
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    };
  });
}

/**
 * Upsert member-on and/or teaser-on. Omitted flags keep their stored value
 * (or default FALSE on first insert). Does not touch R2; PDFs need not exist.
 */
export async function setLibraryItemFlags(
  slug: string,
  patch: LibraryFlagsPatch,
  updatedBy: string | null,
): Promise<LibraryAssetRow> {
  const sql = getSql();
  if (!sql) {
    throw new Error("database_not_configured");
  }

  if (!PACK_A.some((item) => item.slug === slug)) {
    throw new Error("unknown_slug");
  }

  if (patch.downloadable === undefined && patch.teaserPublic === undefined) {
    throw new Error("empty_patch");
  }

  await ensureLibraryAssetsTable();

  const downloadable = patch.downloadable ?? null;
  const teaserPublic = patch.teaserPublic ?? null;

  const rows = (await sql`
    INSERT INTO library_assets (slug, downloadable, teaser_public, updated_at, updated_by)
    VALUES (
      ${slug},
      COALESCE(${downloadable}::boolean, FALSE),
      COALESCE(${teaserPublic}::boolean, FALSE),
      NOW(),
      ${updatedBy}
    )
    ON CONFLICT (slug) DO UPDATE SET
      downloadable = COALESCE(${downloadable}::boolean, library_assets.downloadable),
      teaser_public = COALESCE(${teaserPublic}::boolean, library_assets.teaser_public),
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
    RETURNING slug, downloadable, teaser_public, updated_at, updated_by
  `) as LibraryAssetRow[];

  return rows[0];
}
