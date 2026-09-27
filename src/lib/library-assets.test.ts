import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PACK_A,
  fullObjectKey,
  getLibraryItem,
  libraryItemForSlug,
  teaserObjectKey,
  xlsxObjectKey,
} from "./library-catalog";
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
import { LIBRARY_DOC_VERSION, LIBRARY_SERIALS, serialForSlug } from "./library-serials";

type KeyMapEntry = {
  nnn: string;
  slug: string;
  kind: "pdf" | "xlsx";
  new: { member: string | null; teaser: string | null; xlsx: string | null };
};
const KEY_MAP = JSON.parse(
  readFileSync(join(process.cwd(), "docs/library-r2-key-map.json"), "utf8"),
) as { doc_version: string; entries: KeyMapEntry[] };

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
  it("has the three expected Pack A slugs and serial-folder R2 keys", () => {
    expect(PACK_A.map((i) => i.slug)).toEqual([
      "visa-pathways",
      "entity-selection",
      "austin-ecosystem-map",
    ]);
    expect(PACK_A.map((i) => i.objectKey)).toEqual([
      "library/001-visa-pathways/v1.1-member.pdf",
      "library/002-entity-selection/v1.1-member.pdf",
      "library/003-austin-ecosystem-map/v1.1-member.pdf",
    ]);
    for (const item of PACK_A) {
      expect(item.objectKey).toBe(fullObjectKey(item.slug));
      expect(item.teaserObjectKey).toBe(teaserObjectKey(item.slug));
      expect(item.nnn).toBe(serialForSlug(item.slug)?.nnn);
    }
  });

  it("builds member, teaser and xlsx keys in one serial folder", () => {
    expect(fullObjectKey("visa-pathways")).toBe("library/001-visa-pathways/v1.1-member.pdf");
    expect(teaserObjectKey("visa-pathways")).toBe("library/001-visa-pathways/v1.1-teaser.pdf");
    expect(fullObjectKey("austin-relocation")).toBe(
      "library/004-austin-relocation/v1.1-member.pdf",
    );
    expect(xlsxObjectKey("biz-plan-builder")).toBe("library/008-biz-plan-builder/v1.1.xlsx");
    // Outside the registry: needs a serial from discovery, else null.
    expect(fullObjectKey("brand-new")).toBeNull();
    expect(teaserObjectKey("brand-new", "109")).toBe("library/109-brand-new/v1.1-teaser.pdf");
    // The registry serial wins over a hint.
    expect(fullObjectKey("visa-pathways", "999")).toBe(
      "library/001-visa-pathways/v1.1-member.pdf",
    );
  });

  it("getLibraryItem rejects unknown slugs", () => {
    expect(getLibraryItem("not-a-real-pdf")).toBeUndefined();
    expect(getLibraryItem("visa-pathways")?.title).toBe("Visa pathways");
  });
});

describe("serial registry", () => {
  it("has 108 assets numbered 001–108: Pack A first, then A→Z", () => {
    expect(LIBRARY_SERIALS).toHaveLength(108);
    expect(LIBRARY_SERIALS.map((e) => e.nnn)).toEqual(
      Array.from({ length: 108 }, (_, i) => String(i + 1).padStart(3, "0")),
    );
    expect(LIBRARY_SERIALS.slice(0, 3).map((e) => e.slug)).toEqual(PACK_A.map((i) => i.slug));
    const rest = LIBRARY_SERIALS.slice(3).map((e) => e.slug);
    expect(rest).toEqual([...rest].sort());
    expect(new Set(LIBRARY_SERIALS.map((e) => e.slug)).size).toBe(108);
  });

  it("builders reproduce every new key in docs/library-r2-key-map.json", () => {
    expect(KEY_MAP.doc_version).toBe(LIBRARY_DOC_VERSION);
    expect(KEY_MAP.entries.map(({ nnn, slug, kind }) => ({ nnn, slug, kind }))).toEqual(
      LIBRARY_SERIALS.map(({ nnn, slug, kind }) => ({ nnn, slug, kind })),
    );
    for (const entry of KEY_MAP.entries) {
      const item = libraryItemForSlug(entry.slug);
      if (entry.kind === "pdf") {
        expect(item.objectKey).toBe(entry.new.member);
        expect(item.teaserObjectKey).toBe(entry.new.teaser);
        expect(item.xlsxObjectKey).toBeNull();
      } else {
        expect(item.objectKey).toBe(entry.new.xlsx);
        expect(item.xlsxObjectKey).toBe(entry.new.xlsx);
        expect(item.teaserObjectKey).toBeNull();
      }
    }
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
        fullObjectKey: "library/001-visa-pathways/v1.1-member.pdf",
        teaserObjectKey: "library/001-visa-pathways/v1.1-teaser.pdf",
        xlsxObjectKey: null,
      },
      {
        id: "entity-selection",
        title: "Entity selection",
        description: PACK_A[1].description,
        memberDownloadable: false,
        teaserPublic: false,
        landingFull: false,
        fullObjectKey: "library/002-entity-selection/v1.1-member.pdf",
        teaserObjectKey: "library/002-entity-selection/v1.1-teaser.pdf",
        xlsxObjectKey: null,
      },
      {
        id: "austin-ecosystem-map",
        title: "Austin ecosystem map",
        description: PACK_A[2].description,
        memberDownloadable: false,
        teaserPublic: false,
        landingFull: false,
        fullObjectKey: "library/003-austin-ecosystem-map/v1.1-member.pdf",
        teaserObjectKey: "library/003-austin-ecosystem-map/v1.1-teaser.pdf",
        xlsxObjectKey: null,
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
        "xlsxObjectKey",
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
