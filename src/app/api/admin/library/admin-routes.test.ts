import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/library-assets", () => {
  class UnknownLibrarySlugError extends Error {
    readonly slugs: string[];
    constructor(slugs: string[]) {
      super("unknown_slug");
      this.slugs = slugs;
    }
  }
  return {
    UnknownLibrarySlugError,
    setLibraryItemFlags: vi.fn(),
    setLibraryItemsFlags: vi.fn(),
    resolveLibraryItem: vi.fn(),
  };
});

vi.mock("@/lib/storage", () => ({
  createSignedUrlForExistingObject: vi.fn(),
}));

import { auth, currentUser } from "@clerk/nextjs/server";
import {
  resolveLibraryItem,
  setLibraryItemFlags,
  setLibraryItemsFlags,
} from "@/lib/library-assets";
import { createSignedUrlForExistingObject } from "@/lib/storage";
import { PATCH as patchFlags } from "./[slug]/flags/route";
import { GET as getPreview } from "./[slug]/preview/route";
import { PATCH as patchBulk } from "./flags/bulk/route";

const UID = "user_test_1";
const SLUG = "visa-pathways";

function signIn(publicMetadata: unknown, userId = UID) {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
  vi.mocked(currentUser).mockResolvedValue({
    id: userId,
    publicMetadata,
    primaryEmailAddress: { emailAddress: "staff@example.test" },
    emailAddresses: [{ emailAddress: "staff@example.test" }],
  } as never);
}

function signOut() {
  vi.mocked(auth).mockResolvedValue({ userId: null } as never);
  vi.mocked(currentUser).mockResolvedValue(null);
}

const row = {
  slug: SLUG,
  downloadable: true,
  teaser_public: false,
  landing_full: false,
  updated_at: "2026-11-27T00:00:00.000Z",
  updated_by: "staff@example.test",
};

type Call = () => Promise<Response>;

const routes: { name: string; call: Call; proceed: (res: Response) => void }[] = [
  {
    name: "PATCH /api/admin/library/[slug]/flags",
    call: () =>
      patchFlags(
        new Request(`http://localhost/api/admin/library/${SLUG}/flags`, {
          method: "PATCH",
          body: JSON.stringify({ downloadable: true }),
        }),
        { params: Promise.resolve({ slug: SLUG }) },
      ),
    proceed: (res) => {
      expect(res.status).toBe(200);
      expect(setLibraryItemFlags).toHaveBeenCalledWith(
        SLUG,
        expect.anything(),
        "staff@example.test",
      );
    },
  },
  {
    name: "GET /api/admin/library/[slug]/preview",
    call: () =>
      getPreview(new Request(`http://localhost/api/admin/library/${SLUG}/preview?kind=full`), {
        params: Promise.resolve({ slug: SLUG }),
      }),
    proceed: (res) => {
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://r2.example.test/signed");
      expect(createSignedUrlForExistingObject).toHaveBeenCalled();
    },
  },
  {
    name: "PATCH /api/admin/library/flags/bulk",
    call: () =>
      patchBulk(
        new Request("http://localhost/api/admin/library/flags/bulk", {
          method: "PATCH",
          body: JSON.stringify({ slugs: [SLUG], patch: { approvePublic: true } }),
        }),
      ),
    proceed: (res) => {
      expect(res.status).toBe(200);
      expect(setLibraryItemsFlags).toHaveBeenCalledWith(
        [SLUG],
        expect.anything(),
        "staff@example.test",
      );
    },
  },
];

function expectNoDownstream() {
  expect(setLibraryItemFlags).not.toHaveBeenCalled();
  expect(setLibraryItemsFlags).not.toHaveBeenCalled();
  expect(resolveLibraryItem).not.toHaveBeenCalled();
  expect(createSignedUrlForExistingObject).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setLibraryItemFlags).mockResolvedValue(row as never);
  vi.mocked(setLibraryItemsFlags).mockResolvedValue([row] as never);
  vi.mocked(resolveLibraryItem).mockResolvedValue({
    objectKey: "library/001-visa-pathways/v1.1-member-visa-pathways.pdf",
    teaserObjectKey: "library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf",
  } as never);
  vi.mocked(createSignedUrlForExistingObject).mockResolvedValue({
    ok: true,
    url: "https://r2.example.test/signed",
  } as never);
});

describe.each(routes)("$name auth gate", ({ call, proceed }) => {
  it("401 when signed out", async () => {
    signOut();
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in required" });
    expectNoDownstream();
  });

  it.each([
    ["regular member", {}],
    ["null metadata", null],
    ["invalid staffRole", { staffRole: "superadmin" }],
    ["missing staffRole with chapters", { chapters: ["austin"] }],
    ["non-admin legacy role", { role: "member" }],
    ["chapter_lead", { staffRole: "chapter_lead", chapters: ["austin"] }],
    ["chapter_lead with legacy role admin", { staffRole: "chapter_lead", role: "admin" }],
  ])("403 for %s", async (_label, meta) => {
    signIn(meta);
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expectNoDownstream();
  });

  it("403 when currentUser is missing despite a session", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: UID } as never);
    vi.mocked(currentUser).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(403);
    expectNoDownstream();
  });

  it("403 when currentUser does not match the session user", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: UID } as never);
    vi.mocked(currentUser).mockResolvedValue({
      id: "user_other",
      publicMetadata: { staffRole: "owner" },
      emailAddresses: [],
    } as never);
    const res = await call();
    expect(res.status).toBe(403);
    expectNoDownstream();
  });

  it.each([
    ["admin", { staffRole: "admin" }],
    ["owner", { staffRole: "owner" }],
    ["legacy role admin", { role: "admin" }],
    ["legacy role admin with invalid staffRole", { role: "admin", staffRole: "owenr" }],
  ])("proceeds for %s", async (_label, meta) => {
    signIn(meta);
    proceed(await call());
  });
});
