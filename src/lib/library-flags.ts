import { PACK_A, teaserObjectKey } from "@/lib/library-catalog";

/**
 * Per-asset surface flags. Off always wins for that surface.
 * - downloadable ("member on"): entitled members may download the full PDF here.
 * - teaserPublic ("teaser on"): landing may offer the teaser only. Never unlocks the full PDF.
 */
export type LibraryAssetFlags = {
  downloadable: boolean;
  teaserPublic: boolean;
};

export type LibraryFlagsPatch = Partial<LibraryAssetFlags>;

/** Missing Neon row ⇒ both off. */
export const DEFAULT_LIBRARY_FLAGS: LibraryAssetFlags = {
  downloadable: false,
  teaserPublic: false,
};

/** Slug → flags for every Pack A item, all off. */
export function defaultLibraryFlagsMap(): Record<string, LibraryAssetFlags> {
  return Object.fromEntries(
    PACK_A.map((item) => [item.slug, { ...DEFAULT_LIBRARY_FLAGS }]),
  );
}

/**
 * Validate an Admin PATCH body: `{ downloadable?: boolean, teaserPublic?: boolean }`,
 * at least one present. Returns null when invalid.
 */
export function parseLibraryFlagsPatch(body: unknown): LibraryFlagsPatch | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: LibraryFlagsPatch = {};

  if ("downloadable" in b) {
    if (typeof b.downloadable !== "boolean") return null;
    patch.downloadable = b.downloadable;
  }
  if ("teaserPublic" in b) {
    if (typeof b.teaserPublic !== "boolean") return null;
    patch.teaserPublic = b.teaserPublic;
  }

  if (patch.downloadable === undefined && patch.teaserPublic === undefined) {
    return null;
  }
  return patch;
}

export type PublicLibraryAsset = {
  id: string;
  title: string;
  memberDownloadable: boolean;
  teaserPublic: boolean;
  fullObjectKey: string;
  teaserObjectKey: string;
};

/**
 * Thin public catalog for landing: flags + object keys only (no signed URLs, no secrets).
 * Slugs missing from `flags` are reported as both off.
 */
export function buildPublicLibraryCatalog(
  flags: Record<string, LibraryAssetFlags>,
): { assets: PublicLibraryAsset[] } {
  return {
    assets: PACK_A.map((item) => {
      const f = flags[item.slug] ?? DEFAULT_LIBRARY_FLAGS;
      return {
        id: item.slug,
        title: item.title,
        memberDownloadable: Boolean(f.downloadable),
        teaserPublic: Boolean(f.teaserPublic),
        fullObjectKey: item.objectKey,
        teaserObjectKey: teaserObjectKey(item.slug),
      };
    }),
  };
}
