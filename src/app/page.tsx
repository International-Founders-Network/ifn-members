import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SoftCta } from "@/components/soft-cta";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { isMemberEntitled } from "@/lib/membership";

const MEMBERSHIP_URL = "https://ifn.community/membership";

function statusLabel(entitled: boolean, status?: string, inGrace?: boolean) {
  if (!status) return "No membership on file";
  if (entitled && inGrace) return "Past due (grace period)";
  if (entitled) return status === "trialing" ? "Trialing" : "Active member";
  if (status === "past_due") return "Past due";
  return `Plan: ${status}`;
}

export default async function HomePage() {
  const { userId } = await auth();
  const meetupUrl = process.env.NEXT_PUBLIC_NEXT_MEETUP_URL?.trim();

  if (!userId) {
    return (
      <div className="space-y-8">
        <div>
          <p className="text-sm uppercase tracking-wide text-[var(--crimson)]">
            Members
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Your IFN home
          </h1>
          <p className="mt-3 max-w-xl text-[var(--ink-muted)] leading-relaxed">
            Sign in to see your plan status and open the member library. Membership
            is separate from your account: checkout stays on ifn.community.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Sign in
          </Link>
          <a
            href={MEMBERSHIP_URL}
            className="rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium hover:border-[var(--crimson)]"
          >
            Become a member
          </a>
        </div>
      </div>
    );
  }

  const email = await getVerifiedPrimaryEmail();
  const entitlement = email
    ? await isMemberEntitled(email)
    : { entitled: false as const, reason: "no_email" as const };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-wide text-[var(--crimson)]">
          Members
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          {email ? (
            <>
              Signed in as <span className="text-[var(--ink)]">{email}</span>
            </>
          ) : (
            "We could not confirm a verified email on this account yet."
          )}
        </p>
      </div>

      <section className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--ink-muted)]">
          Plan status
        </h2>
        <p className="mt-2 text-xl font-semibold">
          {statusLabel(
            entitlement.entitled,
            entitlement.status,
            entitlement.inGrace,
          )}
        </p>
        {entitlement.currentPeriodEnd ? (
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Current period ends{" "}
            {new Date(entitlement.currentPeriodEnd).toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            (CT)
          </p>
        ) : null}
        {entitlement.inGrace ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            Your payment needs attention. Library access stays open for a short
            grace window. Update billing from Account when you can.
          </p>
        ) : null}
      </section>

      {entitlement.entitled ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href="/library"
            className="rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open library
          </Link>
          <Link
            href="/account"
            className="rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium hover:border-[var(--crimson)]"
          >
            Account
          </Link>
          {meetupUrl ? (
            <a
              href={meetupUrl}
              className="rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium hover:border-[var(--crimson)]"
              rel="noreferrer"
              target="_blank"
            >
              Next meetup
            </a>
          ) : null}
        </div>
      ) : (
        <SoftCta
          title="Membership not linked yet"
          body={
            entitlement.reason === "no_email"
              ? "Add and verify an email on your Clerk account that matches the email used at checkout, or write hello@ifn.community and we will help."
              : entitlement.reason === "database_not_configured"
                ? "Membership lookup is not configured on this deploy yet. If you just joined, try again shortly or contact hello@ifn.community."
                : entitlement.reason === "past_due_grace_expired"
                  ? "Your membership payment is past due and the grace window has ended. Update billing to reopen the library, or become a member again if you cancelled."
                  : "We could not match a paid membership to this email. If you already paid, use the same email as checkout or contact hello@ifn.community. Auth is not the same as paid access."
          }
          showMembership={entitlement.reason !== "past_due_grace_expired"}
          showPortal={
            entitlement.reason === "past_due_grace_expired" ||
            entitlement.status === "past_due" ||
            Boolean(entitlement.stripeCustomerId)
          }
        />
      )}
    </div>
  );
}
