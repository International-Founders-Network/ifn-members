import { PACK_A, teaserObjectKey } from "@/lib/library-catalog";

/**
 * Per-asset surface flags. Off always wins for that surface.
 * - downloadable ("member on"): entitled members may download the full PDF here.
 * - teaserPublic ("teaser on"): landing may offer the teaser only. Never unlocks the full PDF.
 * - landingFull ("landing full"): landing may offer the full PDF publicly, no sign-in.
 */
export type LibraryAssetFlags = {
  downloadable: boolean;
  teaserPublic: boolean;
  landingFull: boolean;
};

export type LibraryFlagsPatch = Partial<LibraryAssetFlags>;

/** Missing Neon row ⇒ all three off. */
export const DEFAULT_LIBRARY_FLAGS: LibraryAssetFlags = {
  downloadable: false,
  teaserPublic: false,
  landingFull: false,
};

const FLAG_KEYS = ["downloadable", "teaserPublic", "landingFull"] as const;

/** Slug → flags for every Pack A item, all off. */
export function defaultLibraryFlagsMap(): Record<string, LibraryAssetFlags> {
  return Object.fromEntries(
    PACK_A.map((item) => [item.slug, { ...DEFAULT_LIBRARY_FLAGS }]),
  );
}

/**
 * Validate an Admin PATCH body:
 * `{ downloadable?, teaserPublic?, landingFull?, approvePublic? }` (all boolean),
 * resolving to at least one flag. Returns null when invalid.
 *
 * `approvePublic: true` is the primary Admin action and forces `teaserPublic: true`
 * (the teaser can still be turned off by a later patch). It is rejected alongside an
 * explicit `teaserPublic: false`. `approvePublic: false` is a no-op.
 */
export function parseLibraryFlagsPatch(body: unknown): LibraryFlagsPatch | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: LibraryFlagsPatch = {};

  for (const key of FLAG_KEYS) {
    if (key in b) {
      const value = b[key];
      if (typeof value !== "boolean") return null;
      patch[key] = value;
    }
  }

  if ("approvePublic" in b) {
    if (typeof b.approvePublic !== "boolean") return null;
    if (b.approvePublic) {
      if (patch.teaserPublic === false) return null;
      patch.teaserPublic = true;
    }
  }

  if (FLAG_KEYS.every((key) => patch[key] === undefined)) return null;
  return patch;
}

export type PublicLibraryAsset = {
  id: string;
  title: string;
  description: string;
  memberDownloadable: boolean;
  teaserPublic: boolean;
  landingFull: boolean;
  fullObjectKey: string;
  teaserObjectKey: string;
};

/**
 * Thin public catalog for landing: copy, flags and object keys only (no signed URLs,
 * no secrets). Slugs missing from `flags` are reported as all off.
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
        description: item.description,
        memberDownloadable: Boolean(f.downloadable),
        teaserPublic: Boolean(f.teaserPublic),
        landingFull: Boolean(f.landingFull),
        fullObjectKey: item.objectKey,
        teaserObjectKey: teaserObjectKey(item.slug),
      };
    }),
  };
}
