import type { LibraryObjectPresence } from "@/lib/library-discover";
import {
  LIBRARY_DOC_VERSION,
  libraryFolder,
  serialForSlug,
  type LibraryAssetKind,
} from "@/lib/library-serials";

export type LibraryItem = {
  /** Bare slug (`visa-pathways`): API routes, Neon rows and landing ids. Never `001-…`. */
  slug: string;
  title: string;
  description: string;
  /** Content type pill, same vocabulary as landing Resources (`Guide`, `Worksheet`, ...). */
  tag: string;
  /** Serial folder number (`001`); null when neither the registry nor R2 knows it. */
  nnn: string | null;
  /** `pdf` = member + teaser PDFs; `xlsx` = workbook only. */
  kind: LibraryAssetKind;
  /**
   * Private member deliverable in R2: `…/v1.1-member-<slug>.pdf`, or `…/v1.1-<slug>.xlsx` for
   * workbook-only assets. Null when the serial folder is unknown.
   */
  objectKey: string | null;
  /** `…/v1.1-teaser-<slug>.pdf`; null for workbook-only assets or an unknown folder. */
  teaserObjectKey: string | null;
  /** `…/v1.1-<slug>.xlsx` for workbook assets or a PDF with a workbook on R2; else null. */
  xlsxObjectKey: string | null;
};

/**
 * Known Pack A copy (no CMS). Used as title/description overrides; the live catalog
 * also includes every registry serial, R2 upload and Neon row (see `mergeLibraryCatalog`).
 */
export const PACK_A: LibraryItem[] = [
  {
    slug: "visa-pathways",
    title: "Visa pathways",
    description: "A practical map of founder-relevant visa options and how they fit together.",
    tag: "Guide",
    nnn: "001",
    kind: "pdf",
    objectKey: "library/001-visa-pathways/v1.1-member-visa-pathways.pdf",
    teaserObjectKey: "library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf",
    xlsxObjectKey: null,
  },
  {
    slug: "entity-selection",
    title: "Entity selection",
    description: "How to think about entity choice without mistaking paperwork for strategy.",
    tag: "Guide",
    nnn: "002",
    kind: "pdf",
    objectKey: "library/002-entity-selection/v1.1-member-entity-selection.pdf",
    teaserObjectKey: "library/002-entity-selection/v1.1-teaser-entity-selection.pdf",
    xlsxObjectKey: null,
  },
  {
    slug: "austin-ecosystem-map",
    title: "Austin ecosystem map",
    description: "People, places, and paths that matter for founders landing in Austin.",
    tag: "Guide",
    nnn: "003",
    kind: "pdf",
    objectKey: "library/003-austin-ecosystem-map/v1.1-member-austin-ecosystem-map.pdf",
    teaserObjectKey: "library/003-austin-ecosystem-map/v1.1-teaser-austin-ecosystem-map.pdf",
    xlsxObjectKey: null,
  },
];

/** Known Pack A entry only; other slugs resolve via `libraryItemForSlug`. */
export function getLibraryItem(slug: string): LibraryItem | undefined {
  return PACK_A.find((item) => item.slug === slug);
}

/**
 * Slugs come from R2 folder names, so keep them URL- and key-safe: letters, digits,
 * `-` and `_`, starting with a letter or digit. Anything else is skipped by discovery
 * and rejected by the API.
 */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidLibrarySlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

/** Registry serial for `slug`, else the one passed in (e.g. from R2 discovery). */
function resolveSerial(slug: string, nnn?: string | null): string | null {
  return serialForSlug(slug)?.nnn ?? nnn ?? null;
}

/**
 * Full member PDF: `library/<NNN>-<slug>/v1.1-member-<slug>.pdf`. The serial comes from
 * `LIBRARY_SERIALS`; pass `nnn` (from discovery) for slugs outside the registry.
 * Null when neither knows the folder.
 */
export function fullObjectKey(slug: string, nnn?: string | null): string | null {
  const serial = resolveSerial(slug, nnn);
  return serial ? `${libraryFolder(serial, slug)}/${LIBRARY_DOC_VERSION}-member-${slug}.pdf` : null;
}

/**
 * Teaser PDF: `library/<NNN>-<slug>/v1.1-teaser-<slug>.pdf`. Served publicly by
 * `/api/public/library/[slug]/teaser` only while `teaser_public` is on.
 */
export function teaserObjectKey(slug: string, nnn?: string | null): string | null {
  const serial = resolveSerial(slug, nnn);
  return serial ? `${libraryFolder(serial, slug)}/${LIBRARY_DOC_VERSION}-teaser-${slug}.pdf` : null;
}

/** Workbook: `library/<NNN>-<slug>/v1.1-<slug>.xlsx` (no teaser twin). */
export function xlsxObjectKey(slug: string, nnn?: string | null): string | null {
  const serial = resolveSerial(slug, nnn);
  return serial ? `${libraryFolder(serial, slug)}/${LIBRARY_DOC_VERSION}-${slug}.xlsx` : null;
}

/** `austin-ecosystem-map` → `Austin ecosystem map` (sentence case, like PACK_A titles). */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
  if (!words) return slug;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export const DISCOVERED_DESCRIPTION = "New library file from Content. Description coming soon.";
export const DISCOVERED_TAG = "PDF";
export const DISCOVERED_WORKBOOK_TAG = "Workbook";

/**
 * PACK_A copy when known; otherwise a readable title from the slug and a placeholder.
 * Keys come from the serial registry, else from `found.nnn` (R2 discovery). `kind` is
 * the registry's, else `xlsx` when R2 only holds a workbook.
 */
export function libraryItemForSlug(slug: string, found?: LibraryObjectPresence): LibraryItem {
  const known = getLibraryItem(slug);
  const serial = serialForSlug(slug);
  const nnn = resolveSerial(slug, found?.nnn);
  const kind: LibraryAssetKind =
    known?.kind ?? serial?.kind ?? (found?.xlsx && !found.full ? "xlsx" : "pdf");
  const xlsx = kind === "xlsx" || found?.xlsx ? xlsxObjectKey(slug, nnn) : null;

  if (known) {
    return xlsx && !known.xlsxObjectKey ? { ...known, xlsxObjectKey: xlsx } : known;
  }
  return {
    slug,
    title: titleFromSlug(slug),
    description: DISCOVERED_DESCRIPTION,
    tag: kind === "xlsx" ? DISCOVERED_WORKBOOK_TAG : DISCOVERED_TAG,
    nnn,
    kind,
    objectKey: kind === "xlsx" ? xlsx : fullObjectKey(slug, nnn),
    teaserObjectKey: kind === "xlsx" ? null : teaserObjectKey(slug, nnn),
    xlsxObjectKey: xlsx,
  };
}

/**
 * Union of PACK_A and any other slugs (serial registry, R2 discovery, Neon rows).
 * PACK_A keeps its order first; the rest follow alphabetically. Invalid slugs are
 * dropped. `discovered` supplies serials and workbook presence for R2 uploads.
 */
export function mergeLibraryCatalog(
  slugs: Iterable<string>,
  discovered?: ReadonlyMap<string, LibraryObjectPresence> | null,
): LibraryItem[] {
  const known = new Set(PACK_A.map((item) => item.slug));
  const extra = new Set<string>();
  for (const slug of slugs) {
    if (!known.has(slug) && isValidLibrarySlug(slug)) extra.add(slug);
  }
  return [
    ...PACK_A.map((item) => libraryItemForSlug(item.slug, discovered?.get(item.slug))),
    ...[...extra]
      .sort((a, b) => a.localeCompare(b))
      .map((slug) => libraryItemForSlug(slug, discovered?.get(slug))),
  ];
}
