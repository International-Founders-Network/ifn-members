/**
 * Members Slack invite gating. Server only: the invite URL is a secret read
 * from process.env at request time in the account page, never NEXT_PUBLIC_*.
 * Never log the URL.
 */
import type { MemberEntitlement } from "@/lib/entitlement";

export interface SlackInviteEnv {
  SLACK_INVITE_URL?: string;
  SLACK_INVITE_EXPIRES_AT?: string;
}

export type SlackInviteResult =
  | { url: string }
  | { url: null; reason: "missing" | "expired" | "invalid" };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse SLACK_INVITE_EXPIRES_AT into an instant (ms since epoch).
 *
 * A date-only value (2026-11-25) means 00:00 America/Chicago on that date.
 * We pin it to CST (UTC-06:00) instead of resolving DST: for dates in CDT
 * that lands one hour after true Chicago midnight, for CST dates it is exact.
 * Invites are expected to expire in late November (CST), so this is exact for
 * the real use case. Full ISO 8601 timestamps are parsed as given.
 */
export function parseExpiry(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00-06:00` : trimmed;
  // Require an ISO-looking value so loose strings like "soon" or "11/25" fail.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Pure decision: which invite URL (if any) to show right now. */
export function resolveSlackInvite(
  env: SlackInviteEnv,
  now: Date,
): SlackInviteResult {
  const rawUrl = env.SLACK_INVITE_URL?.trim();
  if (!rawUrl) return { url: null, reason: "missing" };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: null, reason: "invalid" };
  }
  if (parsed.protocol !== "https:") return { url: null, reason: "invalid" };

  const rawExpiry = env.SLACK_INVITE_EXPIRES_AT?.trim();
  if (!rawExpiry) return { url: null, reason: "missing" };
  const expiresAt = parseExpiry(rawExpiry);
  if (expiresAt === null) return { url: null, reason: "invalid" };

  if (now.getTime() >= expiresAt) return { url: null, reason: "expired" };
  return { url: rawUrl };
}

/**
 * Slack is for fully active members only: entitled, not in past_due grace,
 * and status active or trialing.
 */
export function isSlackEligible(entitlement: MemberEntitlement): boolean {
  return (
    entitlement.entitled === true &&
    !entitlement.inGrace &&
    (entitlement.status === "active" || entitlement.status === "trialing")
  );
}
