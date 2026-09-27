import { isValidLibrarySlug } from "@/lib/library-catalog";
import { LIBRARY_DOC_VERSION, serialForSlug } from "@/lib/library-serials";
import { listLibraryObjectKeys } from "@/lib/storage";

/** Which objects exist on R2 for a slug, and the serial folder they were found in. */
export type LibraryObjectPresence = {
  full: boolean;
  teaser: boolean;
  xlsx: boolean;
  nnn?: string;
};

/** Slug → presence for everything found under `library/<NNN>-<slug>/`. */
export type DiscoveredLibraryObjects = Map<string, LibraryObjectPresence>;

/** Returns every key under `library/`, or null when storage is not configured. */
export type LibraryObjectLister = () => Promise<string[] | null>;

export type LibraryObjectKind = "full" | "teaser" | "xlsx";

const VERSION = LIBRARY_DOC_VERSION.replace(/\./g, "\\.");
const FOLDER = String.raw`^library/(\d{3})-([^/]+)/`;

/** `^library/(\d{3})-([^/]+)/v1\.1-member\.pdf$` etc. (version from LIBRARY_DOC_VERSION). */
const KEY_PATTERNS: Array<[LibraryObjectKind, RegExp]> = [
  ["full", new RegExp(`${FOLDER}${VERSION}-member\\.pdf$`)],
  ["teaser", new RegExp(`${FOLDER}${VERSION}-teaser\\.pdf$`)],
  ["xlsx", new RegExp(`${FOLDER}${VERSION}\\.xlsx$`)],
];

/**
 * `library/<NNN>-<slug>/v1.1-member.pdf` → full, `…/v1.1-teaser.pdf` → teaser,
 * `…/v1.1.xlsx` → xlsx (lowercase extensions, so keys stay derivable from the slug).
 * Legacy flat keys (`library/<slug>.pdf`, `library/teasers/…`, `pack-a/…`), other
 * versions, deeper folders and unsafe slugs are ignored (null).
 */
export function classifyLibraryObjectKey(
  key: string,
): { slug: string; nnn: string; kind: LibraryObjectKind } | null {
  for (const [kind, pattern] of KEY_PATTERNS) {
    const hit = pattern.exec(key);
    if (hit) {
      return isValidLibrarySlug(hit[2]) ? { slug: hit[2], nnn: hit[1], kind } : null;
    }
  }
  return null;
}

/**
 * Group listed keys by slug. Teaser- or workbook-only slugs are kept. A slug's serial is
 * the registry's (`LIBRARY_SERIALS`) when known, else the first folder listed; keys in a
 * folder with a different serial are ignored so presence always matches the built keys.
 */
export function discoverFromObjectKeys(keys: Iterable<string>): DiscoveredLibraryObjects {
  const found: DiscoveredLibraryObjects = new Map();
  for (const key of keys) {
    const hit = classifyLibraryObjectKey(key);
    if (!hit) continue;
    const nnn = serialForSlug(hit.slug)?.nnn ?? found.get(hit.slug)?.nnn ?? hit.nnn;
    if (hit.nnn !== nnn) continue;
    const presence = found.get(hit.slug) ?? { full: false, teaser: false, xlsx: false, nnn };
    presence[hit.kind] = true;
    found.set(hit.slug, presence);
  }
  return found;
}

/**
 * List `library/` on R2 and group by slug. Fails soft: null when R2 env is missing or
 * the listing errors, so callers fall back to the serial registry + PACK_A + Neon rows.
 */
export async function discoverLibraryCatalog(
  lister: LibraryObjectLister = listLibraryObjectKeys,
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
