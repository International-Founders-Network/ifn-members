import { describe, expect, it } from "vitest";
import {
  GRACE_MS,
  evaluateMembershipRow,
  pickBestEntitlement,
} from "./entitlement";

const NOW = Date.parse("2026-09-25T12:00:00.000Z");

describe("evaluateMembershipRow", () => {
  it("entitles active", () => {
    const result = evaluateMembershipRow(
      {
        status: "active",
        current_period_end: "2027-01-01T00:00:00.000Z",
        last_event_at: "2026-09-01T00:00:00.000Z",
        stripe_customer_id: "cus_1",
      },
      NOW,
    );
    expect(result.entitled).toBe(true);
    expect(result.status).toBe("active");
    expect(result.inGrace).toBeUndefined();
  });

  it("entitles trialing", () => {
    const result = evaluateMembershipRow(
      {
        status: "trialing",
        current_period_end: "2026-10-01T00:00:00.000Z",
        last_event_at: "2026-09-20T00:00:00.000Z",
      },
      NOW,
    );
    expect(result.entitled).toBe(true);
  });

  it("entitles past_due within 7-day grace", () => {
    const last = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = evaluateMembershipRow(
      {
        status: "past_due",
        current_period_end: "2026-10-01T00:00:00.000Z",
        last_event_at: last,
      },
      NOW,
    );
    expect(result.entitled).toBe(true);
    expect(result.inGrace).toBe(true);
  });

  it("denies past_due after grace", () => {
    const last = new Date(NOW - GRACE_MS - 1000).toISOString();
    const result = evaluateMembershipRow(
      {
        status: "past_due",
        current_period_end: "2026-10-01T00:00:00.000Z",
        last_event_at: last,
      },
      NOW,
    );
    expect(result.entitled).toBe(false);
    expect(result.reason).toBe("past_due_grace_expired");
  });

  it("denies canceled", () => {
    const result = evaluateMembershipRow(
      {
        status: "canceled",
        current_period_end: "2026-08-01T00:00:00.000Z",
        last_event_at: "2026-08-01T00:00:00.000Z",
      },
      NOW,
    );
    expect(result.entitled).toBe(false);
    expect(result.reason).toBe("membership_not_active");
  });
});

describe("pickBestEntitlement", () => {
  it("returns no_membership_record for empty", () => {
    expect(pickBestEntitlement([])).toEqual({
      entitled: false,
      reason: "no_membership_record",
    });
  });

  it("prefers entitling row over canceled", () => {
    const result = pickBestEntitlement(
      [
        {
          status: "canceled",
          current_period_end: "2025-01-01T00:00:00.000Z",
          last_event_at: "2025-01-01T00:00:00.000Z",
        },
        {
          status: "active",
          current_period_end: "2027-01-01T00:00:00.000Z",
          last_event_at: "2026-09-01T00:00:00.000Z",
          stripe_customer_id: "cus_live",
        },
      ],
      NOW,
    );
    expect(result.entitled).toBe(true);
    expect(result.status).toBe("active");
    expect(result.stripeCustomerId).toBe("cus_live");
  });
});
