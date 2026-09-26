export type LibraryItem = {
  slug: string;
  title: string;
  description: string;
  /** Content type pill, same vocabulary as landing Resources (`Guide`, `Worksheet`, ...). */
  tag: string;
  /** Private object key in R2/S3 bucket */
  objectKey: string;
};

/** Pack A: hardcoded catalog (no CMS). */
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

export function getLibraryItem(slug: string): LibraryItem | undefined {
  return PACK_A.find((item) => item.slug === slug);
}

/**
 * Teaser object key (Content publishes teasers here). Served publicly by
 * `/api/public/library/[slug]/teaser` only while `teaser_public` is on. Full PDFs stay at `pack-a/<slug>.pdf`.
 */
export function teaserObjectKey(slug: string): string {
  return `pack-a/teasers/${slug}.pdf`;
}
