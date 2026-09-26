import { describe, expect, it } from "vitest";
import { PACK_A, getLibraryItem, teaserObjectKey } from "./library-catalog";
import {
  buildPublicLibraryCatalog,
  defaultLibraryFlagsMap,
  parseLibraryFlagsPatch,
  type LibraryAssetFlags,
} from "./library-flags";
import { isAllowedPublicOrigin, publicCorsHeaders } from "./public-cors";

/**
 * Member download gate: entitled AND member-on (`downloadable`).
 * Mirrors /library + /api/library/[slug]/download; teaserPublic never participates.
 */
function canMemberDownload(
  entitled: boolean,
  flags: Record<string, LibraryAssetFlags>,
  slug: string,
): boolean {
  return entitled && Boolean(flags[slug]?.downloadable);
}

describe("Pack A catalog", () => {
  it("has the three expected Pack A slugs and full R2 keys", () => {
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

  it("teaser keys live under pack-a/teasers/<slug>.pdf", () => {
    expect(teaserObjectKey("visa-pathways")).toBe("pack-a/teasers/visa-pathways.pdf");
  });

  it("getLibraryItem rejects unknown slugs", () => {
    expect(getLibraryItem("not-a-real-pdf")).toBeUndefined();
    expect(getLibraryItem("visa-pathways")?.title).toBe("Visa pathways");
  });
});

describe("Pack A flags", () => {
  it("defaults both flags OFF for every item (missing row)", () => {
    const flags = defaultLibraryFlagsMap();
    expect(Object.keys(flags)).toEqual(PACK_A.map((i) => i.slug));
    for (const item of PACK_A) {
      expect(flags[item.slug]).toEqual({ downloadable: false, teaserPublic: false });
      expect(canMemberDownload(true, flags, item.slug)).toBe(false);
    }
  });

  it("member download is independent of teaserPublic", () => {
    const flags = defaultLibraryFlagsMap();
    flags["visa-pathways"] = { downloadable: false, teaserPublic: true };
    flags["entity-selection"] = { downloadable: true, teaserPublic: false };
    flags["austin-ecosystem-map"] = { downloadable: true, teaserPublic: true };

    // Teaser on must not unlock the member full PDF.
    expect(canMemberDownload(true, flags, "visa-pathways")).toBe(false);
    expect(canMemberDownload(true, flags, "entity-selection")).toBe(true);
    expect(canMemberDownload(true, flags, "austin-ecosystem-map")).toBe(true);
    // Not entitled ⇒ never.
    expect(canMemberDownload(false, flags, "entity-selection")).toBe(false);
  });

  it("parses Admin patches for either or both flags", () => {
    expect(parseLibraryFlagsPatch({ downloadable: true })).toEqual({ downloadable: true });
    expect(parseLibraryFlagsPatch({ teaserPublic: false })).toEqual({ teaserPublic: false });
    expect(parseLibraryFlagsPatch({ downloadable: false, teaserPublic: true })).toEqual({
      downloadable: false,
      teaserPublic: true,
    });
    // Patching one flag never carries a value for the other.
    expect(parseLibraryFlagsPatch({ teaserPublic: true })).not.toHaveProperty("downloadable");
  });

  it("rejects empty or non-boolean patches", () => {
    expect(parseLibraryFlagsPatch({})).toBeNull();
    expect(parseLibraryFlagsPatch(null)).toBeNull();
    expect(parseLibraryFlagsPatch("true")).toBeNull();
    expect(parseLibraryFlagsPatch({ downloadable: "true" })).toBeNull();
    expect(parseLibraryFlagsPatch({ downloadable: true, teaserPublic: 1 })).toBeNull();
  });
});

describe("public catalog", () => {
  it("lists every Pack A item with both flags off when there are no rows", () => {
    const { assets } = buildPublicLibraryCatalog({});
    expect(assets).toEqual([
      {
        id: "visa-pathways",
        title: "Visa pathways",
        memberDownloadable: false,
        teaserPublic: false,
        fullObjectKey: "pack-a/visa-pathways.pdf",
        teaserObjectKey: "pack-a/teasers/visa-pathways.pdf",
      },
      {
        id: "entity-selection",
        title: "Entity selection",
        memberDownloadable: false,
        teaserPublic: false,
        fullObjectKey: "pack-a/entity-selection.pdf",
        teaserObjectKey: "pack-a/teasers/entity-selection.pdf",
      },
      {
        id: "austin-ecosystem-map",
        title: "Austin ecosystem map",
        memberDownloadable: false,
        teaserPublic: false,
        fullObjectKey: "pack-a/austin-ecosystem-map.pdf",
        teaserObjectKey: "pack-a/teasers/austin-ecosystem-map.pdf",
      },
    ]);
  });

  it("reports member-on and teaser-on independently", () => {
    const flags = defaultLibraryFlagsMap();
    flags["visa-pathways"] = { downloadable: false, teaserPublic: true };
    flags["entity-selection"] = { downloadable: true, teaserPublic: false };
    const bySlug = Object.fromEntries(
      buildPublicLibraryCatalog(flags).assets.map((a) => [a.id, a]),
    );
    expect(bySlug["visa-pathways"]).toMatchObject({ memberDownloadable: false, teaserPublic: true });
    expect(bySlug["entity-selection"]).toMatchObject({ memberDownloadable: true, teaserPublic: false });
  });

  it("exposes only flags and object keys (no URLs or secrets)", () => {
    for (const asset of buildPublicLibraryCatalog({}).assets) {
      expect(Object.keys(asset).sort()).toEqual([
        "fullObjectKey",
        "id",
        "memberDownloadable",
        "teaserObjectKey",
        "teaserPublic",
        "title",
      ]);
    }
  });

  it("allows CORS only for landing origins and localhost", () => {
    expect(isAllowedPublicOrigin("https://ifn.community")).toBe(true);
    expect(isAllowedPublicOrigin("https://www.ifn.community")).toBe(true);
    expect(isAllowedPublicOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedPublicOrigin("https://evil.example")).toBe(false);
    expect(isAllowedPublicOrigin("https://ifn.community.evil.example")).toBe(false);
    expect(isAllowedPublicOrigin(null)).toBe(false);

    expect(publicCorsHeaders("https://ifn.community")["Access-Control-Allow-Origin"]).toBe(
      "https://ifn.community",
    );
    expect(publicCorsHeaders("https://evil.example")).not.toHaveProperty(
      "Access-Control-Allow-Origin",
    );
  });
});
