import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSql } from "@/lib/db";
import {
  listLibraryAssetsForAdmin,
  listLibraryCatalogWithFlags,
  resetLibraryAssetsEnsureFlag,
  resolveLibraryItem,
  setLibraryItemsFlags,
  UnknownLibrarySlugError,
} from "./library-assets";
import {
  DISCOVERED_DESCRIPTION,
  PACK_A,
  isValidLibrarySlug,
  libraryItemForSlug,
  mergeLibraryCatalog,
  titleFromSlug,
} from "./library-catalog";
import {
  classifyLibraryObjectKey,
  discoverFromObjectKeys,
  discoverLibraryCatalog,
} from "./library-discover";
import {
  MAX_BULK_SLUGS,
  buildPublicLibraryCatalog,
  parseLibraryBulkRequest,
  parseLibraryFlagsPatch,
} from "./library-flags";
import { LIBRARY_SERIALS } from "./library-serials";

vi.mock("@/lib/db", () => ({ getSql: vi.fn(() => null) }));

type FakeRow = {
  slug: string;
  downloadable: boolean;
  teaser_public: boolean;
  landing_full: boolean;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Minimal Neon stand-in for the statements library-assets issues: DDL (no-op), seed
 * insert (DO NOTHING), slug lookup, bulk COALESCE upsert and full SELECT.
 */
function fakeNeon(initial: FakeRow[] = []) {
  const rows = new Map(initial.map((row) => [row.slug, { ...row }]));
  const statements: string[] = [];

  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$").replace(/\s+/g, " ").trim();
    statements.push(text);

    if (text.startsWith("CREATE TABLE") || text.startsWith("ALTER TABLE")) return [];

    if (text.includes("ON CONFLICT (slug) DO NOTHING")) {
      const inserted = [];
      for (const slug of values[0] as string[]) {
        if (rows.has(slug)) continue;
        rows.set(slug, {
          slug,
          downloadable: false,
          teaser_public: false,
          landing_full: false,
          updated_at: "2026-09-26T00:00:00.000Z",
          updated_by: null,
        });
        inserted.push({ slug });
      }
      return inserted;
    }

    if (text.startsWith("SELECT slug FROM library_assets WHERE slug = ANY")) {
      return (values[0] as string[]).filter((s) => rows.has(s)).map((slug) => ({ slug }));
    }

    if (text.startsWith("INSERT INTO library_assets (slug, downloadable")) {
      // values: d, t, l, updatedBy, slugs, d, t, l
      const [d, t, l, by, slugs] = values as [
        boolean | null,
        boolean | null,
        boolean | null,
        string | null,
        string[],
      ];
      return slugs.map((slug) => {
        const prev = rows.get(slug);
        const next: FakeRow = {
          slug,
          downloadable: d ?? prev?.downloadable ?? false,
          teaser_public: t ?? prev?.teaser_public ?? false,
          landing_full: l ?? prev?.landing_full ?? false,
          updated_at: "2026-09-26T12:00:00.000Z",
          updated_by: by,
        };
        rows.set(slug, next);
        return next;
      });
    }

    if (text.startsWith("SELECT")) return [...rows.values()];
    throw new Error(`fakeNeon: unexpected statement ${text}`);
  };

  return { sql, rows, statements };
}

function useFakeNeon(initial: FakeRow[] = []) {
  const fake = fakeNeon(initial);
  vi.mocked(getSql).mockReturnValue(fake.sql as unknown as ReturnType<typeof getSql>);
  return fake;
}

/**
 * R2 bucket listing with two pages: Pack A, one registry workbook, and 5 serial folders
 * outside the registry (one teaser-only, one PDF + workbook, one workbook-only), plus
 * legacy / off-scheme keys that discovery must ignore.
 */
const R2_KEYS_PAGE_1 = [
  "library/001-visa-pathways/v1.1-member-visa-pathways.pdf",
  "library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf",
  "library/002-entity-selection/v1.1-member-entity-selection.pdf",
  "library/003-austin-ecosystem-map/v1.1-member-austin-ecosystem-map.pdf",
  "library/003-austin-ecosystem-map/v1.1-teaser-austin-ecosystem-map.pdf",
  "library/005-visa-pathways/v1.1-teaser-visa-pathways.pdf", // wrong serial for a registry slug, ignored
  "library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx", // registry workbook
  "library/109-cap-table-basics/v1.1-member-cap-table-basics.pdf",
];
const R2_KEYS_PAGE_2 = [
  "library/110-banking-for-founders/v1.1-member-banking-for-founders.pdf",
  "library/110-banking-for-founders/v1.1-teaser-banking-for-founders.pdf",
  "library/111-hiring-in-texas/v1.1-teaser-hiring-in-texas.pdf", // teaser only
  "library/112-tax_calendar/v1.1-member-tax_calendar.pdf",
  "library/112-tax_calendar/v1.1-tax_calendar.xlsx", // PDF with a workbook
  "library/113-pricing-model/v1.1-pricing-model.xlsx", // workbook only
  "library/002-entity-selection/v1.1-teaser.pdf", // bare basename, ignored
  "library/002-entity-selection/v1.1-teaser-visa-pathways.pdf", // slug mismatch, ignored
  "library/visa-pathways.pdf", // legacy flat key, ignored
  "library/teasers/visa-pathways.pdf", // legacy teaser, ignored
  "library/114-old-version/v1.0-member.pdf", // other version, ignored
  "library/115-nested/drafts/v1.1-member-nested.pdf", // deeper folder, ignored
  "library/", // folder marker
];

const UNREGISTERED = [
  "banking-for-founders",
  "cap-table-basics",
  "hiring-in-texas",
  "pricing-model",
  "tax_calendar",
];

beforeEach(() => {
  resetLibraryAssetsEnsureFlag();
  vi.mocked(getSql).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("slug + title helpers", () => {
  it("derives a readable sentence-case title from the slug", () => {
    expect(titleFromSlug("austin-ecosystem-map")).toBe("Austin ecosystem map");
    expect(titleFromSlug("tax_calendar")).toBe("Tax calendar");
    expect(titleFromSlug("Cap--Table")).toBe("Cap table");
  });

  it("accepts only key- and URL-safe slugs", () => {
    expect(isValidLibrarySlug("visa-pathways")).toBe(true);
    expect(isValidLibrarySlug("tax_calendar2")).toBe(true);
    expect(isValidLibrarySlug("")).toBe(false);
    expect(isValidLibrarySlug("-leading")).toBe(false);
    expect(isValidLibrarySlug("has space")).toBe(false);
    expect(isValidLibrarySlug("../etc")).toBe(false);
    expect(isValidLibrarySlug(42)).toBe(false);
  });

  it("keeps PACK_A copy as overrides and placeholders for other slugs", () => {
    expect(libraryItemForSlug("visa-pathways")).toBe(PACK_A[0]);
    // Registry PDF (004+): keys from the serial, placeholder copy.
    expect(libraryItemForSlug("banking-setup")).toEqual({
      slug: "banking-setup",
      title: "Banking setup",
      description: DISCOVERED_DESCRIPTION,
      tag: "PDF",
      nnn: "006",
      kind: "pdf",
      objectKey: "library/006-banking-setup/v1.1-member-banking-setup.pdf",
      teaserObjectKey: "library/006-banking-setup/v1.1-teaser-banking-setup.pdf",
      xlsxObjectKey: null,
    });
    // Registry workbook: the member deliverable is the xlsx; no teaser.
    expect(libraryItemForSlug("biz-plan-builder")).toMatchObject({
      tag: "Workbook",
      nnn: "008",
      kind: "xlsx",
      objectKey: "library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx",
      teaserObjectKey: null,
      xlsxObjectKey: "library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx",
    });
    // Outside the registry: serial from discovery, or no keys at all.
    expect(
      libraryItemForSlug("cap-table-basics", {
        full: true,
        teaser: false,
        xlsx: true,
        nnn: "109",
      }),
    ).toMatchObject({
      nnn: "109",
      kind: "pdf",
      objectKey: "library/109-cap-table-basics/v1.1-member-cap-table-basics.pdf",
      teaserObjectKey: "library/109-cap-table-basics/v1.1-teaser-cap-table-basics.pdf",
      xlsxObjectKey: "library/109-cap-table-basics/v1.1-cap-table-basics.xlsx",
    });
    expect(libraryItemForSlug("cap-table-basics")).toMatchObject({
      nnn: null,
      objectKey: null,
      teaserObjectKey: null,
      xlsxObjectKey: null,
    });
  });

  it("merges PACK_A first, then extra slugs alphabetically, deduped", () => {
    const merged = mergeLibraryCatalog(["zeta", "visa-pathways", "alpha", "zeta", "bad slug"]);
    expect(merged.map((i) => i.slug)).toEqual([
      "visa-pathways",
      "entity-selection",
      "austin-ecosystem-map",
      "alpha",
      "zeta",
    ]);
  });
});

describe("R2 discovery", () => {
  it("classifies member, teaser and xlsx keys in serial folders", () => {
    expect(classifyLibraryObjectKey("library/001-visa-pathways/v1.1-member-visa-pathways.pdf")).toEqual({
      slug: "visa-pathways",
      nnn: "001",
      kind: "full",
    });
    expect(classifyLibraryObjectKey("library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf")).toEqual({
      slug: "visa-pathways",
      nnn: "001",
      kind: "teaser",
    });
    expect(classifyLibraryObjectKey("library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx")).toEqual({
      slug: "biz-plan-builder",
      nnn: "008",
      kind: "xlsx",
    });
    // The slug keeps its own dashes; only the leading NNN- is the serial.
    expect(
      classifyLibraryObjectKey("library/104-transition-playbook/v1.1-member-transition-playbook.pdf"),
    ).toMatchObject({ slug: "transition-playbook", nnn: "104" });
  });

  it("ignores legacy flat keys, other versions and off-scheme folders", () => {
    for (const key of [
      "pack-a/visa-pathways.pdf",
      "pack-a/teasers/visa-pathways.pdf",
      "library/visa-pathways.pdf",
      "library/teasers/visa-pathways.pdf",
      "library/biz-plan-builder.xlsx",
      "library/001-visa-pathways/v1.0-member.pdf",
      "library/001-visa-pathways/member.pdf",
      "library/001-visa-pathways/v1.1-member.PDF",
      "library/001-visa-pathways/v1.1.XLSX",
      "library/001-visa-pathways/drafts/v1.1-member-visa-pathways.pdf",
      "library/01-visa-pathways/v1.1-member-visa-pathways.pdf",
      "library/1001-visa-pathways/v1.1-member-visa-pathways.pdf",
      "library/001-has space/v1.1-member-has space.pdf",
      "library/001--leading/v1.1-member--leading.pdf",
      "library/001-visa-pathways/v1.1-member.pdf", // bare basename (pre slug-suffix)
      "library/001-visa-pathways/v1.1-teaser.pdf",
      "library/008-biz-plan-builder/v1.1.xlsx",
      "library/001-visa-pathways/v1.1-member-entity-selection.pdf", // slug mismatch
      "library/001-visa-pathways/v1.1-teaser-visa.pdf",
      "library/008-biz-plan-builder/v1.1-biz-plan.xlsx",
      "other/001-visa-pathways/v1.1-member-visa-pathways.pdf",
      "library/",
    ]) {
      expect(classifyLibraryObjectKey(key), key).toBeNull();
    }
  });

  it("groups by slug with serial, keeps teaser- and workbook-only uploads", () => {
    const found = discoverFromObjectKeys([...R2_KEYS_PAGE_1, ...R2_KEYS_PAGE_2]);
    expect(found.get("visa-pathways")).toEqual({
      full: true,
      teaser: true,
      xlsx: false,
      nnn: "001",
    });
    expect(found.get("entity-selection")).toEqual({
      full: true,
      teaser: false,
      xlsx: false,
      nnn: "002",
    });
    expect(found.get("biz-plan-builder")).toEqual({
      full: false,
      teaser: false,
      xlsx: true,
      nnn: "008",
    });
    expect(found.get("hiring-in-texas")).toEqual({
      full: false,
      teaser: true,
      xlsx: false,
      nnn: "111",
    });
    expect(found.get("tax_calendar")).toEqual({
      full: true,
      teaser: false,
      xlsx: true,
      nnn: "112",
    });
    expect(found.get("pricing-model")).toEqual({
      full: false,
      teaser: false,
      xlsx: true,
      nnn: "113",
    });
    expect(found.has("old-version")).toBe(false);
    expect(found.has("nested")).toBe(false);
    expect(found.size).toBe(9);
  });

  it("keeps the registry serial when a stray folder reuses a known slug", () => {
    const found = discoverFromObjectKeys([
      "library/005-visa-pathways/v1.1-member-visa-pathways.pdf",
      "library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf",
    ]);
    expect(found.get("visa-pathways")).toEqual({
      full: false,
      teaser: true,
      xlsx: false,
      nnn: "001",
    });
  });

  it("fails soft: null when R2 is not configured or the listing throws", async () => {
    expect(await discoverLibraryCatalog(async () => null)).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await discoverLibraryCatalog(async () => {
        throw new Error("boom");
      }),
    ).toBeNull();
  });
});

describe("Admin list scales past Pack A", () => {
  it("Admin list returns every registry serial plus R2 folders beyond it (seeds Neon, flags off)", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "test-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_BUCKET", "test-bucket");

    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation(async (command: unknown) => {
        expect(command).toBeInstanceOf(ListObjectsV2Command);
        const input = (command as ListObjectsV2Command).input;
        expect(input).toMatchObject({ Bucket: "test-bucket", Prefix: "library/" });
        return input.ContinuationToken
          ? { Contents: R2_KEYS_PAGE_2.map((Key) => ({ Key })), IsTruncated: false }
          : {
              Contents: R2_KEYS_PAGE_1.map((Key) => ({ Key })),
              IsTruncated: true,
              NextContinuationToken: "page-2",
            };
      });

    const neon = useFakeNeon([
      {
        slug: "visa-pathways",
        downloadable: true,
        teaser_public: true,
        landing_full: false,
        updated_at: "2026-09-20T00:00:00.000Z",
        updated_by: "admin@ifn.community",
      },
    ]);

    const items = await listLibraryAssetsForAdmin();

    expect(send).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(LIBRARY_SERIALS.length + UNREGISTERED.length);
    expect(items.length).toBe(113);
    const slugs = items.map((i) => i.slug);
    expect(slugs.slice(0, 3)).toEqual(PACK_A.map((i) => i.slug));
    expect(slugs.slice(3)).toEqual([...slugs.slice(3)].sort((a, b) => a.localeCompare(b)));
    for (const slug of [...LIBRARY_SERIALS.map((e) => e.slug), ...UNREGISTERED]) {
      expect(slugs).toContain(slug);
    }
    expect(new Set(slugs).size).toBe(slugs.length);

    // Registry + discovered slugs are seeded with every flag off; existing choices survive.
    expect(neon.rows.size).toBe(113);
    for (const slug of ["cap-table-basics", "banking-for-founders", "runway-calc", "vendor-eval"]) {
      expect(neon.rows.get(slug)).toMatchObject({
        downloadable: false,
        teaser_public: false,
        landing_full: false,
        updated_by: null,
      });
    }
    expect(neon.rows.get("visa-pathways")).toMatchObject({
      downloadable: true,
      teaser_public: true,
    });

    const bySlug = Object.fromEntries(items.map((i) => [i.slug, i]));
    expect(bySlug["visa-pathways"]).toMatchObject({ downloadable: true, teaserPublic: true });
    expect(bySlug["visa-pathways"].objectKey).toBe("library/001-visa-pathways/v1.1-member-visa-pathways.pdf");
    expect(bySlug["cap-table-basics"]).toMatchObject({
      title: "Cap table basics",
      description: DISCOVERED_DESCRIPTION,
      nnn: "109",
      objectKey: "library/109-cap-table-basics/v1.1-member-cap-table-basics.pdf",
      teaserObjectKey: "library/109-cap-table-basics/v1.1-teaser-cap-table-basics.pdf",
      xlsxObjectKey: null,
      downloadable: false,
      teaserPublic: false,
      landingFull: false,
      storage: { full: true, teaser: false, xlsx: false, nnn: "109" },
    });
    expect(bySlug["hiring-in-texas"].storage).toEqual({
      full: false,
      teaser: true,
      xlsx: false,
      nnn: "111",
    });
    expect(bySlug["biz-plan-builder"]).toMatchObject({
      kind: "xlsx",
      objectKey: "library/008-biz-plan-builder/v1.1-biz-plan-builder.xlsx",
      teaserObjectKey: null,
      storage: { xlsx: true },
    });
    expect(bySlug["tax_calendar"].xlsxObjectKey).toBe("library/112-tax_calendar/v1.1-tax_calendar.xlsx");
    expect(bySlug["pricing-model"]).toMatchObject({
      kind: "xlsx",
      tag: "Workbook",
      objectKey: "library/113-pricing-model/v1.1-pricing-model.xlsx",
    });
    // Registry serial not on R2 yet: listed with keys, presence all false.
    expect(bySlug["vendor-eval"]).toMatchObject({
      nnn: "108",
      objectKey: "library/108-vendor-eval/v1.1-vendor-eval.xlsx",
      storage: { full: false, teaser: false, xlsx: false },
    });
  });

  it("works with an injected lister (no R2 env) and without a database", async () => {
    const items = await listLibraryAssetsForAdmin({
      lister: async () => [
        ...PACK_A.map((i) => i.objectKey!),
        "library/120-one-more/v1.1-member-one-more.pdf",
        "library/121-two-more/v1.1-teaser-two-more.pdf",
      ],
    });
    expect(items).toHaveLength(LIBRARY_SERIALS.length + 2);
    expect(items.every((i) => !i.downloadable && !i.teaserPublic && !i.landingFull)).toBe(
      true,
    );
  });

  it("falls back to PACK_A + Neon rows when R2 env is missing", async () => {
    useFakeNeon([
      {
        slug: "seeded-earlier",
        downloadable: false,
        teaser_public: true,
        landing_full: false,
        updated_at: "2026-09-21T00:00:00.000Z",
        updated_by: "admin@ifn.community",
      },
    ]);
    const items = await listLibraryAssetsForAdmin();
    expect(items).toHaveLength(LIBRARY_SERIALS.length + 1);
    expect(items.map((i) => i.slug)).toContain("seeded-earlier");
    expect(items.every((i) => i.storage === null)).toBe(true);
    // No R2 listing: a Neon-only slug has no serial folder, so no keys.
    expect(items.find((i) => i.slug === "seeded-earlier")?.objectKey).toBeNull();
  });
});

describe("member + public catalog include discovered assets", () => {
  it("unions R2, PACK_A and Neon without seeding; flags stay off unless set", async () => {
    const neon = useFakeNeon([
      {
        slug: "neon-only",
        downloadable: true,
        teaser_public: false,
        landing_full: false,
        updated_at: "2026-09-21T00:00:00.000Z",
        updated_by: "admin@ifn.community",
      },
    ]);
    const { items, flags } = await listLibraryCatalogWithFlags({
      lister: async () => ["library/109-from-r2/v1.1-member-from-r2.pdf"],
    });
    expect(items.map((i) => i.slug)).toEqual([
      ...PACK_A.map((i) => i.slug),
      "from-r2",
      "neon-only",
    ]);
    expect(neon.statements.some((s) => s.includes("DO NOTHING"))).toBe(false);

    const { assets } = buildPublicLibraryCatalog(flags, items);
    const bySlug = Object.fromEntries(assets.map((a) => [a.id, a]));
    expect(assets).toHaveLength(5);
    expect(bySlug["from-r2"]).toMatchObject({
      title: "From r2",
      memberDownloadable: false,
      teaserPublic: false,
      landingFull: false,
      fullObjectKey: "library/109-from-r2/v1.1-member-from-r2.pdf",
      teaserObjectKey: "library/109-from-r2/v1.1-teaser-from-r2.pdf",
      xlsxObjectKey: null,
    });
    expect(bySlug["neon-only"].memberDownloadable).toBe(true);
  });
});

describe("bulk flags", () => {
  it("denyPublic clears both public surfaces and leaves member download alone", () => {
    expect(parseLibraryFlagsPatch({ denyPublic: true })).toEqual({
      teaserPublic: false,
      landingFull: false,
    });
    expect(parseLibraryFlagsPatch({ denyPublic: true, downloadable: true })).toEqual({
      downloadable: true,
      teaserPublic: false,
      landingFull: false,
    });
    expect(parseLibraryFlagsPatch({ denyPublic: true, teaserPublic: true })).toBeNull();
    expect(parseLibraryFlagsPatch({ denyPublic: true, landingFull: true })).toBeNull();
    expect(parseLibraryFlagsPatch({ denyPublic: true, approvePublic: true })).toBeNull();
    expect(parseLibraryFlagsPatch({ denyPublic: false })).toBeNull();
    expect(parseLibraryFlagsPatch({ denyPublic: "yes" })).toBeNull();
  });

  it("parses { slugs, patch } with dedupe, validation and a slug cap", () => {
    expect(
      parseLibraryBulkRequest(
        { slugs: ["a", "b", "a"], patch: { approvePublic: true } },
        isValidLibrarySlug,
      ),
    ).toEqual({ slugs: ["a", "b"], patch: { teaserPublic: true } });

    const tooMany = Array.from({ length: MAX_BULK_SLUGS + 1 }, (_, i) => `s${i}`);
    for (const body of [
      null,
      { slugs: [], patch: { downloadable: true } },
      { slugs: "a", patch: { downloadable: true } },
      { slugs: ["ok", "../x"], patch: { downloadable: true } },
      { slugs: tooMany, patch: { downloadable: true } },
      { slugs: ["a"], patch: {} },
      { slugs: ["a"] },
    ]) {
      expect(parseLibraryBulkRequest(body, isValidLibrarySlug)).toHaveProperty("error");
    }
  });

  it("flips one flag for many slugs and keeps the others", async () => {
    const neon = useFakeNeon([
      {
        slug: "cap-table-basics",
        downloadable: true,
        teaser_public: false,
        landing_full: true,
        updated_at: "2026-09-21T00:00:00.000Z",
        updated_by: null,
      },
    ]);
    const rows = await setLibraryItemsFlags(
      ["visa-pathways", "cap-table-basics"],
      { teaserPublic: true },
      "admin@ifn.community",
    );
    expect(rows).toHaveLength(2);
    expect(neon.rows.get("cap-table-basics")).toMatchObject({
      downloadable: true,
      teaser_public: true,
      landing_full: true,
      updated_by: "admin@ifn.community",
    });
    expect(neon.rows.get("visa-pathways")).toMatchObject({
      downloadable: false,
      teaser_public: true,
      landing_full: false,
    });
  });

  it("accepts registry serials without a Neon row", async () => {
    const neon = useFakeNeon();
    const rows = await setLibraryItemsFlags(["runway-calc", "banking-setup"], { downloadable: true }, "a");
    expect(rows).toHaveLength(2);
    expect(neon.rows.get("runway-calc")?.downloadable).toBe(true);
  });

  it("rejects the whole batch when any slug is unknown (nothing written)", async () => {
    const neon = useFakeNeon();
    await expect(
      setLibraryItemsFlags(["visa-pathways", "never-uploaded"], { downloadable: true }, "a"),
    ).rejects.toBeInstanceOf(UnknownLibrarySlugError);
    expect(neon.rows.size).toBe(0);
  });
});

describe("resolveLibraryItem", () => {
  it("builds registry keys without touching Neon or R2", async () => {
    const lister = vi.fn(async () => []);
    expect(await resolveLibraryItem("runway-calc", { lister })).toMatchObject({
      nnn: "084",
      kind: "xlsx",
      objectKey: "library/084-runway-calc/v1.1-runway-calc.xlsx",
    });
    expect(lister).not.toHaveBeenCalled();
  });

  it("learns the serial folder from R2 for Neon-only slugs", async () => {
    useFakeNeon([
      {
        slug: "from-r2",
        downloadable: true,
        teaser_public: false,
        landing_full: false,
        updated_at: "2026-09-21T00:00:00.000Z",
        updated_by: null,
      },
    ]);
    const item = await resolveLibraryItem("from-r2", {
      lister: async () => ["library/109-from-r2/v1.1-member-from-r2.pdf"],
    });
    expect(item?.objectKey).toBe("library/109-from-r2/v1.1-member-from-r2.pdf");
    expect(await resolveLibraryItem("never-uploaded", { lister: async () => [] })).toBeUndefined();
    expect(await resolveLibraryItem("001-visa-pathways")).toBeUndefined();
  });
});
