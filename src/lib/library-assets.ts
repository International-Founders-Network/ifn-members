import { getSql } from "@/lib/db";
import {
  getLibraryItem,
  isValidLibrarySlug,
  libraryItemForSlug,
  mergeLibraryCatalog,
  type LibraryItem,
} from "@/lib/library-catalog";
import {
  discoverLibraryCatalog,
  type LibraryObjectLister,
  type LibraryObjectPresence,
} from "@/lib/library-discover";
import {
  applyPublicFlagExclusivity,
  defaultLibraryFlagsMap,
  type LibraryAssetFlags,
  type LibraryFlagsPatch,
} from "@/lib/library-flags";
import { LIBRARY_SERIALS, serialForSlug } from "@/lib/library-serials";

/**
 * `downloadable` = "member on" (column name kept from PR #1).
 * `teaser_public` = "teaser on" (landing teaser only; never unlocks the full PDF).
 * `landing_full` = "landing full" (landing may offer the full PDF publicly).
 * Public teaser and Landing full are mutually exclusive; member download is independent.
 */
export type LibraryAssetRow = {
  slug: string;
  downloadable: boolean;
  teaser_public: boolean;
  landing_full: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

type FlagColumn = "downloadable" | "teaser_public" | "landing_full";

let ensured = false;

/**
 * Ensure library_assets exists with all columns (idempotent). Safe to call often.
 * The ALTERs cover DBs created before teaser_public (PR #1) or landing_full existed.
 * Missing row for a catalog slug means all flags off.
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
      landing_full BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;
  await sql`
    ALTER TABLE library_assets
      ADD COLUMN IF NOT EXISTS teaser_public BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`
    ALTER TABLE library_assets
      ADD COLUMN IF NOT EXISTS landing_full BOOLEAN NOT NULL DEFAULT FALSE
  `;
  ensured = true;
}

/** Reset memo for tests. */
export function resetLibraryAssetsEnsureFlag(): void {
  ensured = false;
}

function rowToFlags(
  row: Pick<LibraryAssetRow, FlagColumn> | undefined,
): LibraryAssetFlags {
  return {
    downloadable: Boolean(row?.downloadable),
    teaserPublic: Boolean(row?.teaser_public),
    landingFull: Boolean(row?.landing_full),
  };
}

async function lookupFlag(slug: string, column: FlagColumn): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT downloadable, teaser_public, landing_full
      FROM library_assets
      WHERE slug = ${slug}
      LIMIT 1
    `) as Array<Pick<LibraryAssetRow, FlagColumn>>;

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

/**
 * Landing full: whether landing may offer the full PDF publicly (no sign-in). Fail closed.
 */
export async function isLibraryItemLandingFull(slug: string): Promise<boolean> {
  return lookupFlag(slug, "landing_full");
}

/**
 * Map of slug → flags for every PACK_A item plus every Neon row (discovered assets are
 * seeded as rows). Missing row = all off.
 */
export async function getLibraryAssetFlags(): Promise<Record<string, LibraryAssetFlags>> {
  const flags = defaultLibraryFlagsMap();

  const sql = getSql();
  if (!sql) return flags;

  try {
    await ensureLibraryAssetsTable();
    const rows = (await sql`
      SELECT slug, downloadable, teaser_public, landing_full
      FROM library_assets
    `) as Array<Pick<LibraryAssetRow, "slug" | FlagColumn>>;

    for (const row of rows) {
      if (isValidLibrarySlug(row.slug)) {
        flags[row.slug] = rowToFlags(row);
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

/**
 * Insert a row (all flags FALSE, `updated_by` NULL) for every slug that has none yet.
 * Never touches existing rows, so Admin choices survive re-discovery. Returns the slugs
 * that were newly inserted.
 */
export async function ensureLibraryAssetsSeeded(slugs: string[]): Promise<string[]> {
  const sql = getSql();
  const valid = [...new Set(slugs.filter(isValidLibrarySlug))];
  if (!sql || valid.length === 0) return [];

  await ensureLibraryAssetsTable();
  const rows = (await sql`
    INSERT INTO library_assets (slug)
    SELECT s FROM unnest(${valid}::text[]) AS t(s)
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug
  `) as Array<{ slug: string }>;
  return rows.map((row) => row.slug);
}

/** PACK_A or in the serial registry: known without a Neon row. */
function isRegisteredLibrarySlug(slug: string): boolean {
  return Boolean(getLibraryItem(slug) ?? serialForSlug(slug));
}

/**
 * Known = PACK_A, serial registry, or has a Neon row (every R2-discovered slug is seeded
 * by Admin list). Returns the slugs that are none of those.
 */
async function findUnknownLibrarySlugs(slugs: string[]): Promise<string[]> {
  const candidates = slugs.filter((slug) => !isRegisteredLibrarySlug(slug));
  if (candidates.length === 0) return [];

  const sql = getSql();
  if (!sql) return candidates;
  await ensureLibraryAssetsTable();
  const rows = (await sql`
    SELECT slug FROM library_assets WHERE slug = ANY(${candidates}::text[])
  `) as Array<{ slug: string }>;
  const found = new Set(rows.map((row) => row.slug));
  return candidates.filter((slug) => !found.has(slug));
}

/**
 * Catalog entry for a slug the routes may serve: PACK_A, the serial registry, or any
 * valid slug with a Neon row (R2 uploads are seeded as rows). Registry slugs build their
 * keys directly; others list R2 once to learn their serial folder (keys stay null when
 * R2 has none). Undefined for unknown slugs or on DB error (fail closed).
 */
export async function resolveLibraryItem(
  slug: string,
  options: { lister?: LibraryObjectLister } = {},
): Promise<LibraryItem | undefined> {
  if (!isValidLibrarySlug(slug)) return undefined;
  if (isRegisteredLibrarySlug(slug)) return libraryItemForSlug(slug);

  try {
    const unknown = await findUnknownLibrarySlugs([slug]);
    if (unknown.length > 0) return undefined;
    const discovered = await discoverLibraryCatalog(options.lister);
    return libraryItemForSlug(slug, discovered?.get(slug));
  } catch (error) {
    console.error(
      "library_assets slug lookup failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return undefined;
  }
}

/**
 * Member library + public catalog: PACK_A ∪ R2 discovery ∪ Neon rows, with flags.
 * Read-only (no seeding) and fail-soft: R2 or DB trouble just narrows the list / turns
 * flags off. Registry serials show up here once Admin has seeded them into Neon.
 */
export async function listLibraryCatalogWithFlags(
  options: { lister?: LibraryObjectLister } = {},
): Promise<{ items: LibraryItem[]; flags: Record<string, LibraryAssetFlags> }> {
  const [discovered, flags] = await Promise.all([
    discoverLibraryCatalog(options.lister),
    getLibraryAssetFlags(),
  ]);
  const items = mergeLibraryCatalog(
    [...(discovered?.keys() ?? []), ...Object.keys(flags)],
    discovered,
  );
  return { items, flags };
}

export type AdminLibraryAsset = LibraryAssetFlags &
  LibraryItem & {
    /** What R2 holds for this slug; null when storage is not configured or listing failed. */
    storage: LibraryObjectPresence | null;
    updated_at: string | null;
    updated_by: string | null;
  };

/**
 * Every asset Admin can act on: serial registry (`LIBRARY_SERIALS`) ∪ R2 discovery
 * (`library/<NNN>-<slug>/`) ∪ PACK_A ∪ Neon rows. Registry and newly discovered slugs
 * are seeded into Neon with all flags off first, so their switches save immediately. A
 * failed seed is logged, never hides an asset.
 */
export async function listLibraryAssetsForAdmin(
  options: { lister?: LibraryObjectLister } = {},
): Promise<AdminLibraryAsset[]> {
  const discovered = await discoverLibraryCatalog(options.lister);
  const listed = [
    ...LIBRARY_SERIALS.map((entry) => entry.slug),
    ...(discovered?.keys() ?? []),
  ];
  const sql = getSql();
  const bySlug = new Map<string, LibraryAssetRow>();

  if (sql) {
    await ensureLibraryAssetsTable();
    if (listed.length > 0) {
      try {
        await ensureLibraryAssetsSeeded(listed);
      } catch (error) {
        console.error(
          "library_assets seed failed:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }
    const rows = (await sql`
      SELECT slug, downloadable, teaser_public, landing_full, updated_at, updated_by
      FROM library_assets
    `) as LibraryAssetRow[];
    for (const row of rows) {
      bySlug.set(row.slug, row);
    }
  }

  const items = mergeLibraryCatalog([...listed, ...bySlug.keys()], discovered);
  return items.map((item) => {
    const row = bySlug.get(item.slug);
    return {
      ...item,
      storage: discovered
        ? (discovered.get(item.slug) ?? { full: false, teaser: false, xlsx: false })
        : null,
      ...rowToFlags(row),
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    };
  });
}

/** Thrown when a flag save names a slug that is not PACK_A, the registry or in Neon. */
export class UnknownLibrarySlugError extends Error {
  readonly slugs: string[];

  constructor(slugs: string[]) {
    super("unknown_slug");
    this.slugs = slugs;
  }
}

/**
 * Upsert any subset of the three flags for one or many slugs in one statement. Omitted
 * flags keep their stored value (or default FALSE on first insert). Public teaser and
 * Landing full are mutually exclusive (turning one ON forces the other OFF); member
 * download is independent. Every slug must be PACK_A, in the serial registry or already
 * have a Neon row, else nothing is written. Does not touch R2.
 */
export async function setLibraryItemsFlags(
  slugs: string[],
  patch: LibraryFlagsPatch,
  updatedBy: string | null,
): Promise<LibraryAssetRow[]> {
  const sql = getSql();
  if (!sql) {
    throw new Error("database_not_configured");
  }

  const exclusive = applyPublicFlagExclusivity(patch);
  if (!exclusive) {
    throw new Error("exclusive_public_flags");
  }
  patch = exclusive;

  if (
    patch.downloadable === undefined &&
    patch.teaserPublic === undefined &&
    patch.landingFull === undefined
  ) {
    throw new Error("empty_patch");
  }

  const unique = [...new Set(slugs)];
  const invalid = unique.filter((slug) => !isValidLibrarySlug(slug));
  if (unique.length === 0 || invalid.length > 0) {
    throw new UnknownLibrarySlugError(invalid);
  }

  await ensureLibraryAssetsTable();
  const unknown = await findUnknownLibrarySlugs(unique);
  if (unknown.length > 0) {
    throw new UnknownLibrarySlugError(unknown);
  }

  const downloadable = patch.downloadable ?? null;
  const teaserPublic = patch.teaserPublic ?? null;
  const landingFull = patch.landingFull ?? null;

  return (await sql`
    INSERT INTO library_assets (slug, downloadable, teaser_public, landing_full, updated_at, updated_by)
    SELECT
      s,
      COALESCE(${downloadable}::boolean, FALSE),
      COALESCE(${teaserPublic}::boolean, FALSE),
      COALESCE(${landingFull}::boolean, FALSE),
      NOW(),
      ${updatedBy}
    FROM unnest(${unique}::text[]) AS t(s)
    ON CONFLICT (slug) DO UPDATE SET
      downloadable = COALESCE(${downloadable}::boolean, library_assets.downloadable),
      teaser_public = COALESCE(${teaserPublic}::boolean, library_assets.teaser_public),
      landing_full = COALESCE(${landingFull}::boolean, library_assets.landing_full),
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
    RETURNING slug, downloadable, teaser_public, landing_full, updated_at, updated_by
  `) as LibraryAssetRow[];
}

/** Single-slug save (per-card switches). Same rules as `setLibraryItemsFlags`. */
export async function setLibraryItemFlags(
  slug: string,
  patch: LibraryFlagsPatch,
  updatedBy: string | null,
): Promise<LibraryAssetRow> {
  const rows = await setLibraryItemsFlags([slug], patch, updatedBy);
  return rows[0];
}
