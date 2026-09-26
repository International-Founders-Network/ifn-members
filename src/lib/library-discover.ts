import { isValidLibrarySlug } from "@/lib/library-catalog";
import { listPackAObjectKeys } from "@/lib/storage";

/** Which Pack A objects exist on R2 for a slug. */
export type LibraryObjectPresence = { full: boolean; teaser: boolean };

/** Slug → presence for everything found under `pack-a/`. */
export type DiscoveredLibraryObjects = Map<string, LibraryObjectPresence>;

/** Returns every key under `pack-a/`, or null when storage is not configured. */
export type PackAObjectLister = () => Promise<string[] | null>;

const FULL_KEY = /^pack-a\/([^/]+)\.pdf$/;
const TEASER_KEY = /^pack-a\/teasers\/([^/]+)\.pdf$/;

/**
 * `pack-a/<slug>.pdf` → full, `pack-a/teasers/<slug>.pdf` → teaser (lowercase `.pdf`,
 * so the key stays derivable from the slug). Non-PDFs (xlsx
 * later), deeper folders and unsafe filenames are ignored (null).
 */
export function classifyLibraryObjectKey(
  key: string,
): { slug: string; kind: "full" | "teaser" } | null {
  const teaser = TEASER_KEY.exec(key);
  if (teaser) {
    return isValidLibrarySlug(teaser[1]) ? { slug: teaser[1], kind: "teaser" } : null;
  }
  const full = FULL_KEY.exec(key);
  if (full) {
    return isValidLibrarySlug(full[1]) ? { slug: full[1], kind: "full" } : null;
  }
  return null;
}

/** Group listed keys by slug. Teaser-only slugs are kept (full: false). */
export function discoverFromObjectKeys(keys: Iterable<string>): DiscoveredLibraryObjects {
  const found: DiscoveredLibraryObjects = new Map();
  for (const key of keys) {
    const hit = classifyLibraryObjectKey(key);
    if (!hit) continue;
    const presence = found.get(hit.slug) ?? { full: false, teaser: false };
    presence[hit.kind] = true;
    found.set(hit.slug, presence);
  }
  return found;
}

/**
 * List `pack-a/` on R2 and group by slug. Fails soft: null when R2 env is missing or
 * the listing errors, so callers fall back to PACK_A + Neon rows.
 */
export async function discoverLibraryCatalog(
  lister: PackAObjectLister = listPackAObjectKeys,
): Promise<DiscoveredLibraryObjects | null> {
  try {
    const keys = await lister();
    return keys ? discoverFromObjectKeys(keys) : null;
  } catch (error) {
    console.error(
      "R2 library discovery failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return null;
  }
}
