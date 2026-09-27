import { PACK_A, type LibraryItem } from "@/lib/library-catalog";

/**
 * Per-asset surface flags. Off always wins for that surface.
 * - downloadable ("member on"): entitled members may download the full PDF here.
 * - teaserPublic ("teaser on"): landing may offer the teaser only. Never unlocks the full PDF.
 * - landingFull ("landing full"): landing may offer the full PDF publicly, no sign-in.
 *
 * Public teaser and Landing full are mutually exclusive: turning one ON forces the
 * other OFF. Member download stays independent.
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
 * Public teaser and Landing full cannot both be ON. Turning one ON forces the other
 * OFF in the returned patch. Returns null when the patch asks for both ON.
 * Member download is never touched by this helper.
 */
export function applyPublicFlagExclusivity(
  patch: LibraryFlagsPatch,
): LibraryFlagsPatch | null {
  if (patch.teaserPublic === true && patch.landingFull === true) {
    return null;
  }
  const next: LibraryFlagsPatch = { ...patch };
  if (next.teaserPublic === true) {
    next.landingFull = false;
  } else if (next.landingFull === true) {
    next.teaserPublic = false;
  }
  return next;
}

/**
 * Validate an Admin PATCH body:
 * `{ downloadable?, teaserPublic?, landingFull?, approvePublic?, denyPublic? }` (all
 * boolean), resolving to at least one flag. Returns null when invalid.
 *
 * - `approvePublic: true` is the primary Admin action and forces `teaserPublic: true`
 *   and `landingFull: false` (the teaser can still be turned off by a later patch).
 * - `denyPublic: true` clears both public surfaces: `teaserPublic: false` and
 *   `landingFull: false`. Member download is untouched.
 * - Turning Public teaser ON forces Landing full OFF (and vice versa). Both OFF is fine.
 *
 * Contradictions (approve + `teaserPublic: false`, deny + a public flag `true`,
 * approve + deny, both public flags true in one patch) are rejected.
 * `approvePublic: false` / `denyPublic: false` are no-ops.
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

  for (const shortcut of ["approvePublic", "denyPublic"] as const) {
    if (shortcut in b && typeof b[shortcut] !== "boolean") return null;
  }
  const approve = b.approvePublic === true;
  const deny = b.denyPublic === true;
  if (approve && deny) return null;

  if (approve) {
    if (patch.teaserPublic === false) return null;
    patch.teaserPublic = true;
  }

  if (deny) {
    if (patch.teaserPublic === true || patch.landingFull === true) return null;
    patch.teaserPublic = false;
    patch.landingFull = false;
  }

  if (FLAG_KEYS.every((key) => patch[key] === undefined)) return null;
  return applyPublicFlagExclusivity(patch);
}

/** Most slugs one bulk request may touch. */
export const MAX_BULK_SLUGS = 100;

export type LibraryBulkRequest = { slugs: string[]; patch: LibraryFlagsPatch };

/**
 * Validate `{ slugs: string[], patch: {...} }` for the bulk Admin PATCH. Slugs are
 * de-duplicated; 1..MAX_BULK_SLUGS, each passing `isValidSlug`. `patch` follows
 * `parseLibraryFlagsPatch`. Returns an error message instead of throwing.
 */
export function parseLibraryBulkRequest(
  body: unknown,
  isValidSlug: (slug: unknown) => slug is string,
): LibraryBulkRequest | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Body must be { slugs: string[], patch: {...} }" };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.slugs) || b.slugs.length === 0) {
    return { error: "slugs must be a non-empty array" };
  }
  if (!b.slugs.every(isValidSlug)) {
    return { error: "Every slug must be a string of letters, digits, - or _" };
  }
  const slugs = [...new Set(b.slugs as string[])];
  if (slugs.length > MAX_BULK_SLUGS) {
    return { error: `At most ${MAX_BULK_SLUGS} slugs per request` };
  }

  const patch = parseLibraryFlagsPatch(b.patch);
  if (!patch) {
    return {
      error:
        "patch must include at least one boolean of downloadable, teaserPublic, landingFull, approvePublic: true or denyPublic: true (no contradictions)",
    };
  }

  return { slugs, patch };
}

export type PublicLibraryAsset = {
  id: string;
  title: string;
  description: string;
  memberDownloadable: boolean;
  teaserPublic: boolean;
  landingFull: boolean;
  /** `library/<NNN>-<slug>/v1.1-member-<slug>.pdf` (or `v1.1-<slug>.xlsx` for workbooks); null if unknown. */
  fullObjectKey: string | null;
  /** `library/<NNN>-<slug>/v1.1-teaser-<slug>.pdf`; null for workbooks or if unknown. */
  teaserObjectKey: string | null;
  /** `library/<NNN>-<slug>/v1.1-<slug>.xlsx` when the asset has a workbook; else null. */
  xlsxObjectKey: string | null;
};

/**
 * Thin public catalog for landing: copy, flags and object keys only (no signed URLs,
 * no secrets). `items` is the merged catalog (PACK_A + R2 + Neon); defaults to PACK_A.
 * Slugs missing from `flags` are reported as all off.
 */
export function buildPublicLibraryCatalog(
  flags: Record<string, LibraryAssetFlags>,
  items: LibraryItem[] = PACK_A,
): { assets: PublicLibraryAsset[] } {
  return {
    assets: items.map((item) => {
      const f = flags[item.slug] ?? DEFAULT_LIBRARY_FLAGS;
      return {
        id: item.slug,
        title: item.title,
        description: item.description,
        memberDownloadable: Boolean(f.downloadable),
        teaserPublic: Boolean(f.teaserPublic),
        landingFull: Boolean(f.landingFull),
        fullObjectKey: item.objectKey,
        teaserObjectKey: item.teaserObjectKey,
        xlsxObjectKey: item.xlsxObjectKey,
      };
    }),
  };
}
