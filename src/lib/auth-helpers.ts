import { auth, currentUser } from "@clerk/nextjs/server";

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

/** Clerk publicMetadata.role === 'admin' (set in Clerk Dashboard by Venkat). */
export async function isClerkAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const role = (user.publicMetadata as { role?: unknown } | null)?.role;
  return role === "admin";
}
