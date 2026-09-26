export type LibraryItem = {
  slug: string;
  title: string;
  description: string;
  /** Content type pill, same vocabulary as landing Resources (`Guide`, `Worksheet`, ...). */
  tag: string;
  /** Private object key in R2/S3 bucket */
  objectKey: string;
};

/**
 * Known Pack A copy (no CMS). Used as title/description overrides; the live catalog
 * also includes every slug discovered on R2 or stored in Neon (see `mergeLibraryCatalog`).
 */
export const PACK_A: LibraryItem[] = [
  {
    slug: "visa-pathways",
    title: "Visa pathways",
    description: "A practical map of founder-relevant visa options and how they fit together.",
    tag: "Guide",
    objectKey: "pack-a/visa-pathways.pdf",
  },
  {
    slug: "entity-selection",
    title: "Entity selection",
    description: "How to think about entity choice without mistaking paperwork for strategy.",
    tag: "Guide",
    objectKey: "pack-a/entity-selection.pdf",
  },
  {
    slug: "austin-ecosystem-map",
    title: "Austin ecosystem map",
    description: "People, places, and paths that matter for founders landing in Austin.",
    tag: "Guide",
    objectKey: "pack-a/austin-ecosystem-map.pdf",
  },
];

/** Known Pack A entry only; discovered slugs resolve via `libraryItemForSlug`. */
export function getLibraryItem(slug: string): LibraryItem | undefined {
  return PACK_A.find((item) => item.slug === slug);
}

/**
 * Slugs come from R2 filenames, so keep them URL- and key-safe: letters, digits,
 * `-` and `_`, starting with a letter or digit. Anything else is skipped by discovery
 * and rejected by the API.
 */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidLibrarySlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

/** Full member PDF key: `pack-a/<slug>.pdf`. */
export function fullObjectKey(slug: string): string {
  return `pack-a/${slug}.pdf`;
}

/** `austin-ecosystem-map` → `Austin ecosystem map` (sentence case, like PACK_A titles). */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
  if (!words) return slug;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export const DISCOVERED_DESCRIPTION = "New Pack A file from Content. Description coming soon.";
export const DISCOVERED_TAG = "PDF";

/** PACK_A copy when known; otherwise a readable title from the slug and a placeholder. */
export function libraryItemForSlug(slug: string): LibraryItem {
  return (
    getLibraryItem(slug) ?? {
      slug,
      title: titleFromSlug(slug),
      description: DISCOVERED_DESCRIPTION,
      tag: DISCOVERED_TAG,
      objectKey: fullObjectKey(slug),
    }
  );
}

/**
 * Union of PACK_A and any other slugs (R2 discovery, Neon rows). PACK_A keeps its
 * order first; the rest follow alphabetically. Invalid slugs are dropped.
 */
export function mergeLibraryCatalog(slugs: Iterable<string>): LibraryItem[] {
  const known = new Set(PACK_A.map((item) => item.slug));
  const extra = new Set<string>();
  for (const slug of slugs) {
    if (!known.has(slug) && isValidLibrarySlug(slug)) extra.add(slug);
  }
  return [
    ...PACK_A,
    ...[...extra].sort((a, b) => a.localeCompare(b)).map(libraryItemForSlug),
  ];
}

/**
 * Teaser object key (Content publishes teasers here). Served publicly by
 * `/api/public/library/[slug]/teaser` only while `teaser_public` is on. Full PDFs stay at `pack-a/<slug>.pdf`.
 */
export function teaserObjectKey(slug: string): string {
  return `pack-a/teasers/${slug}.pdf`;
}
