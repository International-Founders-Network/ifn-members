import { auth, currentUser, type User } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  NO_STAFF,
  hasPermission,
  parseStaffContext,
  type Permission,
  type StaffContext,
} from "@/lib/staff-permissions";

/** Verified primary email from Clerk, or null (soft-fail, never invent). */
export async function getVerifiedPrimaryEmail(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0];

  if (!primary?.emailAddress) return null;

  // Clerk status is one of unverified | verified | transferable | failed |
  // expired, and verification itself can be null. Only "verified" may claim a
  // paid membership, so allow-list instead of deny-listing "unverified".
  if (primary.verification?.status !== "verified") return null;

  return primary.emailAddress;
}

export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Staff role + permissions for the signed-in user, from Clerk
 * `publicMetadata` (see `staff-permissions.ts`). Signed out ⇒ no staff.
 */
export async function getStaffContext(): Promise<StaffContext> {
  const user = await currentUser();
  if (!user) return NO_STAFF;
  return parseStaffContext(user.publicMetadata, user.id);
}

export async function currentUserHasPermission(permission: Permission): Promise<boolean> {
  return hasPermission(await getStaffContext(), permission);
}

export type StaffGate =
  | { ok: true; userId: string; user: User; staff: StaffContext }
  | { ok: false; response: NextResponse };

/**
 * API route gate. 401 `Sign in required` without a session, 403 `Admin only`
 * without the permission. Always re-checks Clerk on the server.
 */
export async function requireStaffPermission(permission: Permission): Promise<StaffGate> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }

  const user = await currentUser();
  const staff =
    user && user.id === userId ? parseStaffContext(user.publicMetadata, user.id) : NO_STAFF;
  if (!user || !hasPermission(staff, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }

  return { ok: true, userId, user, staff };
}
