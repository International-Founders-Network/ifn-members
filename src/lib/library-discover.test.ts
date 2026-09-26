import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSql } from "@/lib/db";
import {
  listLibraryAssetsForAdmin,
  listLibraryCatalogWithFlags,
  resetLibraryAssetsEnsureFlag,
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

/** R2 bucket listing with two pages, 4 new slugs beyond Pack A, one teaser-only. */
const R2_KEYS_PAGE_1 = [
  "pack-a/visa-pathways.pdf",
  "pack-a/entity-selection.pdf",
  "pack-a/austin-ecosystem-map.pdf",
  "pack-a/teasers/visa-pathways.pdf",
  "pack-a/cap-table-basics.pdf",
];
const R2_KEYS_PAGE_2 = [
  "pack-a/banking-for-founders.pdf",
  "pack-a/teasers/banking-for-founders.pdf",
  "pack-a/teasers/hiring-in-texas.pdf", // teaser only
  "pack-a/tax_calendar.pdf",
  "pack-a/pricing-model.xlsx", // ignored until xlsx lands
  "pack-a/drafts/unreleased.pdf", // nested folder, ignored
  "pack-a/", // folder marker
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

  it("keeps PACK_A copy as overrides and placeholders for unknown slugs", () => {
    expect(libraryItemForSlug("visa-pathways")).toBe(PACK_A[0]);
    expect(libraryItemForSlug("cap-table-basics")).toEqual({
      slug: "cap-table-basics",
      title: "Cap table basics",
      description: DISCOVERED_DESCRIPTION,
      tag: "PDF",
      objectKey: "pack-a/cap-table-basics.pdf",
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
  it("classifies full and teaser keys and ignores everything else", () => {
    expect(classifyLibraryObjectKey("pack-a/visa-pathways.pdf")).toEqual({
      slug: "visa-pathways",
      kind: "full",
    });
    expect(classifyLibraryObjectKey("pack-a/teasers/visa-pathways.pdf")).toEqual({
      slug: "visa-pathways",
      kind: "teaser",
    });
    expect(classifyLibraryObjectKey("pack-a/model.xlsx")).toBeNull();
    expect(classifyLibraryObjectKey("pack-a/drafts/x.pdf")).toBeNull();
    expect(classifyLibraryObjectKey("pack-a/Upper.PDF")).toBeNull();
    expect(classifyLibraryObjectKey("pack-a/has space.pdf")).toBeNull();
    expect(classifyLibraryObjectKey("pack-b/visa-pathways.pdf")).toBeNull();
  });

  it("groups by slug and keeps teaser-only uploads", () => {
    const found = discoverFromObjectKeys([...R2_KEYS_PAGE_1, ...R2_KEYS_PAGE_2]);
    expect(found.get("visa-pathways")).toEqual({ full: true, teaser: true });
    expect(found.get("entity-selection")).toEqual({ full: true, teaser: false });
    expect(found.get("hiring-in-texas")).toEqual({ full: false, teaser: true });
    expect(found.has("pricing-model")).toBe(false);
    expect(found.has("unreleased")).toBe(false);
    expect(found.size).toBe(7);
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
  it("Admin list returns > 3 assets when R2 ListObjectsV2 has more than Pack A (seeds Neon, flags off)", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "test-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_BUCKET", "test-bucket");

    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation(async (command: unknown) => {
        expect(command).toBeInstanceOf(ListObjectsV2Command);
        const input = (command as ListObjectsV2Command).input;
        expect(input).toMatchObject({ Bucket: "test-bucket", Prefix: "pack-a/" });
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
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.map((i) => i.slug)).toEqual([
      "visa-pathways",
      "entity-selection",
      "austin-ecosystem-map",
      "banking-for-founders",
      "cap-table-basics",
      "hiring-in-texas",
      "tax_calendar",
    ]);

    // Discovered slugs are seeded with every flag off; existing choices survive.
    for (const slug of ["cap-table-basics", "banking-for-founders", "hiring-in-texas"]) {
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
    expect(bySlug["cap-table-basics"]).toMatchObject({
      title: "Cap table basics",
      description: DISCOVERED_DESCRIPTION,
      objectKey: "pack-a/cap-table-basics.pdf",
      teaserObjectKey: "pack-a/teasers/cap-table-basics.pdf",
      downloadable: false,
      teaserPublic: false,
      landingFull: false,
      storage: { full: true, teaser: false },
    });
    expect(bySlug["hiring-in-texas"].storage).toEqual({ full: false, teaser: true });
  });

  it("works with an injected lister (no R2 env) and without a database", async () => {
    const items = await listLibraryAssetsForAdmin({
      lister: async () => [
        ...PACK_A.map((i) => i.objectKey),
        "pack-a/one-more.pdf",
        "pack-a/teasers/two-more.pdf",
      ],
    });
    expect(items).toHaveLength(5);
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
    expect(items.map((i) => i.slug)).toEqual([...PACK_A.map((i) => i.slug), "seeded-earlier"]);
    expect(items.every((i) => i.storage === null)).toBe(true);
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
      lister: async () => ["pack-a/from-r2.pdf"],
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
      fullObjectKey: "pack-a/from-r2.pdf",
      teaserObjectKey: "pack-a/teasers/from-r2.pdf",
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

  it("rejects the whole batch when any slug is unknown (nothing written)", async () => {
    const neon = useFakeNeon();
    await expect(
      setLibraryItemsFlags(["visa-pathways", "never-uploaded"], { downloadable: true }, "a"),
    ).rejects.toBeInstanceOf(UnknownLibrarySlugError);
    expect(neon.rows.size).toBe(0);
  });
});
