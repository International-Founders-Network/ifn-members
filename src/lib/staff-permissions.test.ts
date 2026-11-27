import { describe, expect, it } from "vitest";
import {
  NO_STAFF,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  isFullAdmin,
  parseStaffContext,
  type Permission,
  type StaffContext,
} from "./staff-permissions";

const UID = "user_test_1";

function allowed(ctx: StaffContext): Permission[] {
  return PERMISSIONS.filter((p) => hasPermission(ctx, p));
}

describe("parseStaffContext roles", () => {
  it("owner gets every permission", () => {
    const ctx = parseStaffContext({ staffRole: "owner" }, UID);
    expect(ctx.staffRole).toBe("owner");
    expect(ctx.legacyAdmin).toBe(false);
    expect(ctx.userId).toBe(UID);
    expect(allowed(ctx)).toEqual(["roster:read", "library:admin", "staff:grant"]);
    expect(isFullAdmin(ctx)).toBe(true);
  });

  it("admin gets roster and library, not staff:grant", () => {
    const ctx = parseStaffContext({ staffRole: "admin" }, UID);
    expect(ctx.staffRole).toBe("admin");
    expect(allowed(ctx)).toEqual(["roster:read", "library:admin"]);
    expect(hasPermission(ctx, "staff:grant")).toBe(false);
    expect(isFullAdmin(ctx)).toBe(true);
  });

  it("chapter_lead with chapters gets no global permissions", () => {
    const ctx = parseStaffContext({ staffRole: "chapter_lead", chapters: ["austin"] }, UID);
    expect(ctx.staffRole).toBe("chapter_lead");
    expect(ctx.chapters).toEqual(["austin"]);
    expect(hasPermission(ctx, "roster:read")).toBe(false);
    expect(hasPermission(ctx, "library:admin")).toBe(false);
    expect(hasPermission(ctx, "staff:grant")).toBe(false);
    expect(isFullAdmin(ctx)).toBe(false);
  });

  it("chapter_lead without chapters has empty chapters and no permissions", () => {
    const ctx = parseStaffContext({ staffRole: "chapter_lead" }, UID);
    expect(ctx.staffRole).toBe("chapter_lead");
    expect(ctx.chapters).toEqual([]);
    expect(allowed(ctx)).toEqual([]);
  });

  it("regular signed-in member (no staff metadata) has nothing", () => {
    for (const meta of [{}, { plan: "member" }]) {
      const ctx = parseStaffContext(meta, UID);
      expect(ctx.staffRole).toBeNull();
      expect(ctx.legacyAdmin).toBe(false);
      expect(ctx.userId).toBe(UID);
      expect(allowed(ctx)).toEqual([]);
      expect(isFullAdmin(ctx)).toBe(false);
    }
  });
});

describe("parseStaffContext fail-closed", () => {
  it("no user id means no staff even with owner metadata", () => {
    for (const uid of [undefined, null, ""]) {
      const ctx = parseStaffContext({ staffRole: "owner", role: "admin" }, uid);
      expect(ctx).toBe(NO_STAFF);
      expect(allowed(ctx)).toEqual([]);
      expect(isFullAdmin(ctx)).toBe(false);
    }
  });

  it("null, undefined and non-object metadata mean no staff", () => {
    for (const meta of [null, undefined, "admin", 42, true, ["owner"]]) {
      const ctx = parseStaffContext(meta, UID);
      expect(ctx.staffRole).toBeNull();
      expect(allowed(ctx)).toEqual([]);
    }
  });

  it("hasPermission and isFullAdmin reject null / undefined contexts", () => {
    expect(hasPermission(null, "roster:read")).toBe(false);
    expect(hasPermission(undefined, "library:admin")).toBe(false);
    expect(isFullAdmin(null)).toBe(false);
    expect(isFullAdmin(undefined)).toBe(false);
  });

  it("hasPermission rejects a forged context with no userId", () => {
    const forged: StaffContext = {
      userId: null,
      staffRole: "owner",
      chapters: [],
      legacyAdmin: false,
      permissions: new Set(PERMISSIONS),
    };
    expect(allowed(forged)).toEqual([]);
    expect(isFullAdmin(forged)).toBe(false);
  });

  it("invalid or unknown staffRole without legacy admin grants nothing", () => {
    for (const staffRole of ["superadmin", "Owner", "ADMIN", " admin", "chapter-lead", "member", 1, true, null, {}, ["admin"]]) {
      const ctx = parseStaffContext({ staffRole }, UID);
      expect(ctx.staffRole).toBeNull();
      expect(ctx.legacyAdmin).toBe(false);
      expect(allowed(ctx)).toEqual([]);
    }
  });

  it("missing or empty staffRole grants nothing", () => {
    expect(allowed(parseStaffContext({ chapters: ["austin"] }, UID))).toEqual([]);
    expect(allowed(parseStaffContext({ staffRole: "" }, UID))).toEqual([]);
  });

  it("role other than admin grants nothing", () => {
    for (const role of ["owner", "Admin", "staff", "member", "", true, 1]) {
      const ctx = parseStaffContext({ role }, UID);
      expect(ctx.staffRole).toBeNull();
      expect(ctx.legacyAdmin).toBe(false);
      expect(allowed(ctx)).toEqual([]);
    }
  });
});

describe("parseStaffContext legacy role: admin", () => {
  it("legacy role admin alone is full admin", () => {
    const ctx = parseStaffContext({ role: "admin" }, UID);
    expect(ctx.staffRole).toBe("admin");
    expect(ctx.legacyAdmin).toBe(true);
    expect(allowed(ctx)).toEqual(["roster:read", "library:admin"]);
    expect(isFullAdmin(ctx)).toBe(true);
  });

  it("valid staffRole wins over legacy role", () => {
    const owner = parseStaffContext({ role: "admin", staffRole: "owner" }, UID);
    expect(owner.staffRole).toBe("owner");
    expect(owner.legacyAdmin).toBe(false);
    expect(hasPermission(owner, "staff:grant")).toBe(true);

    const lead = parseStaffContext({ role: "admin", staffRole: "chapter_lead", chapters: ["austin"] }, UID);
    expect(lead.staffRole).toBe("chapter_lead");
    expect(lead.legacyAdmin).toBe(false);
    expect(allowed(lead)).toEqual([]);
  });

  it("legacy role admin still grants admin when staffRole is invalid or empty", () => {
    for (const staffRole of ["owenr", "superadmin", "", 7, null]) {
      const ctx = parseStaffContext({ role: "admin", staffRole }, UID);
      expect(ctx.staffRole).toBe("admin");
      expect(ctx.legacyAdmin).toBe(true);
      expect(allowed(ctx)).toEqual(["roster:read", "library:admin"]);
    }
  });
});

describe("parseStaffContext chapters", () => {
  it("non-array chapters becomes []", () => {
    for (const chapters of ["austin", 1, null, undefined, { austin: true }]) {
      expect(parseStaffContext({ staffRole: "chapter_lead", chapters }, UID).chapters).toEqual([]);
    }
  });

  it("keeps only non-empty strings, trimmed and de-duplicated", () => {
    const ctx = parseStaffContext(
      { staffRole: "chapter_lead", chapters: ["austin", 3, null, "", "   ", { id: "x" }, " dallas ", "austin"] },
      UID,
    );
    expect(ctx.chapters).toEqual(["austin", "dallas"]);
  });

  it("chapters never grant permissions on their own", () => {
    const ctx = parseStaffContext({ chapters: ["austin"] }, UID);
    expect(ctx.staffRole).toBeNull();
    expect(ctx.chapters).toEqual(["austin"]);
    expect(allowed(ctx)).toEqual([]);
  });
});

describe("ROLE_PERMISSIONS matrix", () => {
  it("matches the v1 lock", () => {
    expect(ROLE_PERMISSIONS).toEqual({
      owner: ["roster:read", "library:admin", "staff:grant"],
      admin: ["roster:read", "library:admin"],
      chapter_lead: [],
    });
  });

  it("owner ⊇ admin ⊇ chapter_lead", () => {
    for (const p of ROLE_PERMISSIONS.admin) expect(ROLE_PERMISSIONS.owner).toContain(p);
    for (const p of ROLE_PERMISSIONS.chapter_lead) expect(ROLE_PERMISSIONS.admin).toContain(p);
  });

  it("only owner holds staff:grant", () => {
    const holders = (Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).filter(
      (r) => ROLE_PERMISSIONS[r].includes("staff:grant"),
    );
    expect(holders).toEqual(["owner"]);
  });
});
