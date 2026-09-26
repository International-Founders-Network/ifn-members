/**
 * Membership entitlement from Neon `memberships` (Stripe webhooks on landing).
 * Auth ≠ paid. Soft-fail only — never invent entitlement.
 *
 * Entitled when status is active | trialing, OR past_due within 7-day grace
 * measured from last_event_at.
 */

export const GRACE_DAYS = 7;
export const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

const FULLY_ENTITLING = new Set(["active", "trialing"]);

export type EntitlementReason =
  | "no_email"
  | "database_not_configured"
  | "no_membership_record"
  | "membership_not_active"
  | "past_due_grace_expired"
  | "lookup_failed";

export interface MemberEntitlement {
  entitled: boolean;
  status?: string;
  currentPeriodEnd?: string | null;
  lastEventAt?: string | null;
  /** True when entitled only because of past_due grace window. */
  inGrace?: boolean;
  reason?: EntitlementReason;
  stripeCustomerId?: string;
}

export interface MembershipRow {
  status: string | null;
  current_period_end: string | Date | null;
  last_event_at: string | Date | null;
  stripe_customer_id?: string | null;
}

export function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Pure decision for one row (exported for unit tests). */
export function evaluateMembershipRow(
  row: MembershipRow,
  nowMs: number = Date.now(),
): MemberEntitlement {
  const status = row.status ?? undefined;
  const currentPeriodEnd = toIso(row.current_period_end);
  const lastEventAt = toIso(row.last_event_at);
  const stripeCustomerId = row.stripe_customer_id ?? undefined;

  if (status && FULLY_ENTITLING.has(status)) {
    return {
      entitled: true,
      status,
      currentPeriodEnd,
      lastEventAt,
      stripeCustomerId: stripeCustomerId || undefined,
    };
  }

  if (status === "past_due") {
    const lastMs = lastEventAt ? new Date(lastEventAt).getTime() : NaN;
    if (!Number.isNaN(lastMs) && nowMs - lastMs <= GRACE_MS) {
      return {
        entitled: true,
        status,
        currentPeriodEnd,
        lastEventAt,
        inGrace: true,
        stripeCustomerId: stripeCustomerId || undefined,
      };
    }
    return {
      entitled: false,
      status,
      currentPeriodEnd,
      lastEventAt,
      reason: "past_due_grace_expired",
      stripeCustomerId: stripeCustomerId || undefined,
    };
  }

  return {
    entitled: false,
    status,
    currentPeriodEnd,
    lastEventAt,
    reason: "membership_not_active",
    stripeCustomerId: stripeCustomerId || undefined,
  };
}

/** Pick the best row when an email has several subscriptions. */
export function pickBestEntitlement(
  rows: MembershipRow[],
  nowMs: number = Date.now(),
): MemberEntitlement {
  if (rows.length === 0) {
    return { entitled: false, reason: "no_membership_record" };
  }

  const evaluated = rows.map((row) => evaluateMembershipRow(row, nowMs));
  const entitled = evaluated
    .filter((e) => e.entitled)
    .sort((a, b) => {
      const left = a.currentPeriodEnd ?? "";
      const right = b.currentPeriodEnd ?? "";
      return right.localeCompare(left);
    });

  if (entitled.length > 0) {
    return entitled[0];
  }

  // Prefer reporting the most recent last_event_at among non-entitled.
  const sorted = [...evaluated].sort((a, b) => {
    const left = a.lastEventAt ?? "";
    const right = b.lastEventAt ?? "";
    return right.localeCompare(left);
  });
  return sorted[0];
}
