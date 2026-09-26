import { getSql } from "@/lib/db";
import {
  type MemberEntitlement,
  type MembershipRow,
  pickBestEntitlement,
} from "@/lib/entitlement";

/**
 * Look up entitlement for a verified Clerk primary email.
 * Never throws; soft-fails with reason.
 */
export async function isMemberEntitled(
  email: string,
): Promise<MemberEntitlement> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { entitled: false, reason: "no_email" };
  }

  const sql = getSql();
  if (!sql) {
    return { entitled: false, reason: "database_not_configured" };
  }

  try {
    const rows = (await sql`
      SELECT status, current_period_end, last_event_at, stripe_customer_id
      FROM memberships
      WHERE lower(email) = ${normalized}
    `) as MembershipRow[];

    return pickBestEntitlement(rows);
  } catch (error) {
    console.error(
      "Membership lookup failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { entitled: false, reason: "lookup_failed" };
  }
}

export async function listMemberships(): Promise<
  Array<{
    id: number;
    email: string | null;
    status: string;
    current_period_end: string | null;
    last_event_at: string | null;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    created_at: string | null;
    updated_at: string | null;
  }>
> {
  const sql = getSql();
  if (!sql) {
    throw new Error("database_not_configured");
  }

  const rows = await sql`
    SELECT
      id,
      email,
      status,
      current_period_end,
      last_event_at,
      stripe_customer_id,
      stripe_subscription_id,
      created_at,
      updated_at
    FROM memberships
    ORDER BY coalesce(updated_at, created_at) DESC NULLS LAST, id DESC
  `;

  return rows as Array<{
    id: number;
    email: string | null;
    status: string;
    current_period_end: string | null;
    last_event_at: string | null;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    created_at: string | null;
    updated_at: string | null;
  }>;
}
