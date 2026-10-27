import { describe, expect, it } from "vitest";
import { isSlackEligible, parseExpiry, resolveSlackInvite } from "./slack-invite";

const URL_OK = "https://example.invalid/slack-invite";
const NOW = new Date("2026-10-27T12:00:00.000Z");

describe("resolveSlackInvite", () => {
  it("returns the url when valid and not expired", () => {
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: "2026-11-25" },
        NOW,
      ),
    ).toEqual({ url: URL_OK });
  });

  it("missing url", () => {
    expect(
      resolveSlackInvite({ SLACK_INVITE_EXPIRES_AT: "2026-11-25" }, NOW),
    ).toEqual({ url: null, reason: "missing" });
  });

  it("blank url", () => {
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: "   ", SLACK_INVITE_EXPIRES_AT: "2026-11-25" },
        NOW,
      ),
    ).toEqual({ url: null, reason: "missing" });
  });

  it("non-https url", () => {
    expect(
      resolveSlackInvite(
        {
          SLACK_INVITE_URL: "http://example.invalid/slack-invite",
          SLACK_INVITE_EXPIRES_AT: "2026-11-25",
        },
        NOW,
      ),
    ).toEqual({ url: null, reason: "invalid" });
  });

  it("unparseable url", () => {
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: "not a url", SLACK_INVITE_EXPIRES_AT: "2026-11-25" },
        NOW,
      ),
    ).toEqual({ url: null, reason: "invalid" });
  });

  it("missing expiry", () => {
    expect(resolveSlackInvite({ SLACK_INVITE_URL: URL_OK }, NOW)).toEqual({
      url: null,
      reason: "missing",
    });
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: " " },
        NOW,
      ),
    ).toEqual({ url: null, reason: "missing" });
  });

  it("unparseable expiry", () => {
    for (const bad of ["soon", "11/25/2026", "2026-13-45", "2026-11-25Tnope"]) {
      expect(
        resolveSlackInvite(
          { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: bad },
          NOW,
        ),
      ).toEqual({ url: null, reason: "invalid" });
    }
  });

  it("exactly at expiry is expired", () => {
    const at = "2026-11-25T18:00:00.000Z";
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: at },
        new Date(at),
      ),
    ).toEqual({ url: null, reason: "expired" });
  });

  it("one ms before a timestamp expiry is still valid", () => {
    expect(
      resolveSlackInvite(
        {
          SLACK_INVITE_URL: URL_OK,
          SLACK_INVITE_EXPIRES_AT: "2026-11-25T18:00:00.000Z",
        },
        new Date(Date.parse("2026-11-25T18:00:00.000Z") - 1),
      ),
    ).toEqual({ url: URL_OK });
  });

  it("past expiry", () => {
    expect(
      resolveSlackInvite(
        { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: "2026-10-01" },
        NOW,
      ),
    ).toEqual({ url: null, reason: "expired" });
  });

  it("date-only expiry ends at 00:00 CST (06:00 UTC) on that date", () => {
    const env = { SLACK_INVITE_URL: URL_OK, SLACK_INVITE_EXPIRES_AT: "2026-11-25" };
    expect(resolveSlackInvite(env, new Date("2026-11-25T05:59:59.999Z"))).toEqual({
      url: URL_OK,
    });
    expect(resolveSlackInvite(env, new Date("2026-11-25T06:00:00.000Z"))).toEqual({
      url: null,
      reason: "expired",
    });
  });
});

describe("parseExpiry", () => {
  it("parses date-only as CST midnight", () => {
    expect(parseExpiry("2026-11-25")).toBe(Date.parse("2026-11-25T06:00:00.000Z"));
  });

  it("parses offset timestamps as given", () => {
    expect(parseExpiry("2026-11-25T00:00:00-05:00")).toBe(
      Date.parse("2026-11-25T05:00:00.000Z"),
    );
  });
});

describe("isSlackEligible", () => {
  it("active", () => {
    expect(isSlackEligible({ entitled: true, status: "active" })).toBe(true);
  });

  it("trialing", () => {
    expect(isSlackEligible({ entitled: true, status: "trialing" })).toBe(true);
  });

  it("past_due in grace", () => {
    expect(
      isSlackEligible({ entitled: true, status: "past_due", inGrace: true }),
    ).toBe(false);
  });

  it("canceled", () => {
    expect(
      isSlackEligible({
        entitled: false,
        status: "canceled",
        reason: "membership_not_active",
      }),
    ).toBe(false);
  });

  it("not entitled even if status says active", () => {
    expect(isSlackEligible({ entitled: false, status: "active" })).toBe(false);
  });

  it("no row or no email", () => {
    expect(
      isSlackEligible({ entitled: false, reason: "no_membership_record" }),
    ).toBe(false);
    expect(isSlackEligible({ entitled: false, reason: "no_email" })).toBe(false);
  });
});
