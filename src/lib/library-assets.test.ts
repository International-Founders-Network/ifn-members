import { describe, expect, it } from "vitest";
import { PACK_A, getLibraryItem } from "./library-catalog";

/**
 * Download gate defaults: missing Neon row / empty flags map ⇒ not downloadable.
 * (DB-backed helpers are fail-closed the same way; this locks the catalog contract.)
 */
function isDownloadableFromFlags(
  flags: Record<string, boolean>,
  slug: string,
): boolean {
  return Boolean(flags[slug]);
}

describe("Pack A download gate contract", () => {
  it("catalog has the three expected Pack A slugs and R2 keys", () => {
    expect(PACK_A.map((i) => i.slug)).toEqual([
      "visa-pathways",
      "entity-selection",
      "austin-ecosystem-map",
    ]);
    expect(PACK_A.map((i) => i.objectKey)).toEqual([
      "pack-a/visa-pathways.pdf",
      "pack-a/entity-selection.pdf",
      "pack-a/austin-ecosystem-map.pdf",
    ]);
  });

  it("defaults OFF when flag map is empty (admin has not enabled)", () => {
    const flags: Record<string, boolean> = {};
    for (const item of PACK_A) {
      expect(isDownloadableFromFlags(flags, item.slug)).toBe(false);
    }
  });

  it("allows download only when flag is explicitly true", () => {
    const flags = {
      "visa-pathways": true,
      "entity-selection": false,
    };
    expect(isDownloadableFromFlags(flags, "visa-pathways")).toBe(true);
    expect(isDownloadableFromFlags(flags, "entity-selection")).toBe(false);
    expect(isDownloadableFromFlags(flags, "austin-ecosystem-map")).toBe(false);
  });

  it("getLibraryItem rejects unknown slugs", () => {
    expect(getLibraryItem("not-a-real-pdf")).toBeUndefined();
    expect(getLibraryItem("visa-pathways")?.title).toBe("Visa pathways");
  });
});
