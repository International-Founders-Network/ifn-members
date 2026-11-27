/**
 * Staff roles + permissions (pure, no I/O). Source of truth is Clerk
 * `publicMetadata`, set by hand in the Clerk Dashboard:
 *
 *   { "staffRole": "owner" | "admin" | "chapter_lead", "chapters": ["austin"] }
 *
 * Legacy bootstrap `{ "role": "admin" }` still means full admin until a later
 * cleanup PR removes the fallback. Staff role is not paid membership: Library
 * access stays on `isMemberEntitled` (Neon `memberships`).
 */

export const STAFF_ROLES = ["owner", "admin", "chapter_lead"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * - `roster:read`: global Neon memberships roster (`/admin/members`).
 * - `library:admin`: `/admin/library` and every `/api/admin/library/*` route.
 * - `staff:grant`: grant/revoke staff roles. Owner only. Reserved: there is no
 *   API or UI for it yet (Clerk Dashboard only).
 */
export const PERMISSIONS = ["roster:read", "library:admin", "staff:grant"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** owner ⊇ admin ⊇ chapter_lead. chapter_lead gets nothing global in v1. */
export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly Permission[]>> = {
  owner: ["roster:read", "library:admin", "staff:grant"],
  admin: ["roster:read", "library:admin"],
  chapter_lead: [],
};

export type StaffContext = {
  userId: string | null;
  staffRole: StaffRole | null;
  /** Chapter slugs for future chapter-scoped views. Not a permission today. */
  chapters: string[];
  /** True when access comes only from legacy `role: "admin"`. */
  legacyAdmin: boolean;
  permissions: ReadonlySet<Permission>;
};

export const NO_STAFF: StaffContext = Object.freeze({
  userId: null,
  staffRole: null,
  chapters: [],
  legacyAdmin: false,
  permissions: new Set<Permission>(),
});

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

function parseChapters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/**
 * Fail-closed parse of Clerk `publicMetadata`. No user ⇒ no staff.
 * A valid `staffRole` wins over legacy `role`. A missing or unknown
 * `staffRole` falls back to legacy `role: "admin"` so a typo cannot lock out
 * the bootstrap admin.
 */
export function parseStaffContext(
  publicMetadata: unknown,
  userId?: string | null,
): StaffContext {
  if (!userId) return NO_STAFF;

  const meta =
    publicMetadata && typeof publicMetadata === "object" && !Array.isArray(publicMetadata)
      ? (publicMetadata as Record<string, unknown>)
      : {};

  let staffRole: StaffRole | null = null;
  let legacyAdmin = false;
  if (isStaffRole(meta.staffRole)) {
    staffRole = meta.staffRole;
  } else if (meta.role === "admin") {
    staffRole = "admin";
    legacyAdmin = true;
  }

  return {
    userId,
    staffRole,
    chapters: parseChapters(meta.chapters),
    legacyAdmin,
    permissions: new Set(staffRole ? ROLE_PERMISSIONS[staffRole] : []),
  };
}

export function hasPermission(
  ctx: StaffContext | null | undefined,
  permission: Permission,
): boolean {
  if (!ctx?.userId) return false;
  return ctx.permissions.has(permission);
}

/** owner, admin, or legacy `role: "admin"`. */
export function isFullAdmin(ctx: StaffContext | null | undefined): boolean {
  if (!ctx?.userId) return false;
  return ctx.staffRole === "owner" || ctx.staffRole === "admin";
}
