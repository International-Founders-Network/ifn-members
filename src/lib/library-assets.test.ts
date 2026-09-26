import { describe, expect, it } from "vitest";
import { PACK_A, getLibraryItem, teaserObjectKey } from "./library-catalog";
import {
  buildPublicLibraryCatalog,
  defaultLibraryFlagsMap,
  parseLibraryFlagsPatch,
  type LibraryAssetFlags,
} from "./library-flags";
import {
  ADMIN_STATUS_FILTERS,
  matchesAdminStatus,
  matchesLibraryQuery,
} from "./library-filter";
import { isAllowedPublicOrigin, publicCorsHeaders } from "./public-cors";

const ALL_OFF: LibraryAssetFlags = {
  downloadable: false,
  teaserPublic: false,
  landingFull: false,
};

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
  it("defaults all three flags OFF for every item (missing row)", () => {
    const flags = defaultLibraryFlagsMap();
    expect(Object.keys(flags)).toEqual(PACK_A.map((i) => i.slug));
    for (const item of PACK_A) {
      expect(flags[item.slug]).toEqual(ALL_OFF);
      expect(canMemberDownload(true, flags, item.slug)).toBe(false);
    }
  });

  it("member download is independent of teaserPublic and landingFull", () => {
    const flags = defaultLibraryFlagsMap();
    flags["visa-pathways"] = { downloadable: false, teaserPublic: true, landingFull: true };
    flags["entity-selection"] = { downloadable: true, teaserPublic: false, landingFull: false };
    flags["austin-ecosystem-map"] = { downloadable: true, teaserPublic: true, landingFull: false };

    // Teaser on / landing full must not unlock the member full PDF.
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
    expect(parseLibraryFlagsPatch({ landingFull: true })).toEqual({ landingFull: true });
    // Patching one flag never carries a value for the others.
    expect(parseLibraryFlagsPatch({ teaserPublic: true })).not.toHaveProperty("downloadable");
    expect(parseLibraryFlagsPatch({ landingFull: false })).toEqual({ landingFull: false });
    expect(Object.keys(parseLibraryFlagsPatch({ downloadable: true })!)).toEqual([
      "downloadable",
    ]);
  });

  it("approvePublic turns the Public teaser on and touches nothing else", () => {
    expect(parseLibraryFlagsPatch({ approvePublic: true })).toEqual({ teaserPublic: true });
    expect(parseLibraryFlagsPatch({ approvePublic: true, teaserPublic: true })).toEqual({
      teaserPublic: true,
    });
    expect(parseLibraryFlagsPatch({ approvePublic: true, landingFull: true })).toEqual({
      teaserPublic: true,
      landingFull: true,
    });
    // Teaser can still be turned off afterward with a plain patch.
    expect(parseLibraryFlagsPatch({ teaserPublic: false })).toEqual({ teaserPublic: false });
  });

  it("rejects contradictory or empty approvePublic patches", () => {
    expect(parseLibraryFlagsPatch({ approvePublic: true, teaserPublic: false })).toBeNull();
    expect(parseLibraryFlagsPatch({ approvePublic: false })).toBeNull();
    expect(parseLibraryFlagsPatch({ approvePublic: "yes" })).toBeNull();
    expect(parseLibraryFlagsPatch({ approvePublic: false, downloadable: true })).toEqual({
      downloadable: true,
    });
  });

  it("rejects empty or non-boolean patches", () => {
    expect(parseLibraryFlagsPatch({})).toBeNull();
    expect(parseLibraryFlagsPatch(null)).toBeNull();
    expect(parseLibraryFlagsPatch("true")).toBeNull();
    expect(parseLibraryFlagsPatch({ downloadable: "true" })).toBeNull();
    expect(parseLibraryFlagsPatch({ downloadable: true, teaserPublic: 1 })).toBeNull();
    expect(parseLibraryFlagsPatch({ landingFull: "false" })).toBeNull();
    expect(parseLibraryFlagsPatch({ unknownFlag: true })).toBeNull();
  });
});

describe("public catalog", () => {
  it("lists every Pack A item with all flags off when there are no rows", () => {
    const { assets } = buildPublicLibraryCatalog({});
    expect(assets).toEqual([
      {
        id: "visa-pathways",
        title: "Visa pathways",
        description: PACK_A[0].description,
        memberDownloadable: false,
        teaserPublic: false,
        landingFull: false,
        fullObjectKey: "pack-a/visa-pathways.pdf",
        teaserObjectKey: "pack-a/teasers/visa-pathways.pdf",
      },
      {
        id: "entity-selection",
        title: "Entity selection",
        description: PACK_A[1].description,
        memberDownloadable: false,
        teaserPublic: false,
        landingFull: false,
        fullObjectKey: "pack-a/entity-selection.pdf",
        teaserObjectKey: "pack-a/teasers/entity-selection.pdf",
      },
      {
        id: "austin-ecosystem-map",
        title: "Austin ecosystem map",
        description: PACK_A[2].description,
        memberDownloadable: false,
        teaserPublic: false,
        landingFull: false,
        fullObjectKey: "pack-a/austin-ecosystem-map.pdf",
        teaserObjectKey: "pack-a/teasers/austin-ecosystem-map.pdf",
      },
    ]);
  });

  it("reports member-on, teaser-on and landing-full independently", () => {
    const flags = defaultLibraryFlagsMap();
    flags["visa-pathways"] = { downloadable: false, teaserPublic: true, landingFull: false };
    flags["entity-selection"] = { downloadable: true, teaserPublic: false, landingFull: false };
    flags["austin-ecosystem-map"] = { downloadable: false, teaserPublic: false, landingFull: true };
    const bySlug = Object.fromEntries(
      buildPublicLibraryCatalog(flags).assets.map((a) => [a.id, a]),
    );
    expect(bySlug["visa-pathways"]).toMatchObject({
      memberDownloadable: false,
      teaserPublic: true,
      landingFull: false,
    });
    expect(bySlug["entity-selection"]).toMatchObject({
      memberDownloadable: true,
      teaserPublic: false,
      landingFull: false,
    });
    expect(bySlug["austin-ecosystem-map"]).toMatchObject({
      memberDownloadable: false,
      teaserPublic: false,
      landingFull: true,
    });
  });

  it("carries the Pack A description landing cards need", () => {
    const { assets } = buildPublicLibraryCatalog({});
    expect(assets[0].description).toBe(
      "A practical map of founder-relevant visa options and how they fit together.",
    );
    for (const asset of assets) {
      expect(asset.description.length).toBeGreaterThan(0);
    }
  });

  it("exposes only copy, flags and object keys (no URLs or secrets)", () => {
    for (const asset of buildPublicLibraryCatalog({}).assets) {
      expect(Object.keys(asset).sort()).toEqual([
        "description",
        "fullObjectKey",
        "id",
        "landingFull",
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

describe("library search + status filters", () => {
  const visa = { ...PACK_A[0], ...ALL_OFF, teaserPublic: true };

  it("matches title, slug and description case-insensitively", () => {
    expect(matchesLibraryQuery(visa, "")).toBe(true);
    expect(matchesLibraryQuery(visa, "  VISA ")).toBe(true);
    expect(matchesLibraryQuery(visa, "visa-path")).toBe(true);
    expect(matchesLibraryQuery(visa, "fit together")).toBe(true);
    expect(matchesLibraryQuery(visa, "austin")).toBe(false);
  });

  it("status filters follow each flag independently", () => {
    expect(ADMIN_STATUS_FILTERS.map((f) => f.id)).toEqual([
      "all",
      "member",
      "teaser",
      "landingFull",
      "off",
    ]);
    expect(matchesAdminStatus(visa, "all")).toBe(true);
    expect(matchesAdminStatus(visa, "teaser")).toBe(true);
    expect(matchesAdminStatus(visa, "member")).toBe(false);
    expect(matchesAdminStatus(visa, "landingFull")).toBe(false);
    expect(matchesAdminStatus(visa, "off")).toBe(false);
    expect(matchesAdminStatus(ALL_OFF, "off")).toBe(true);
    expect(matchesAdminStatus({ ...ALL_OFF, landingFull: true }, "landingFull")).toBe(true);
  });
});
