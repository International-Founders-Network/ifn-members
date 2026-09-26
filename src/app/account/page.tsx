import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { SoftCta } from "@/components/soft-cta";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { isMemberEntitled } from "@/lib/membership";

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const email = await getVerifiedPrimaryEmail();
  const entitlement = email
    ? await isMemberEntitled(email)
    : { entitled: false as const, reason: "no_email" as const };

  const planLabel = entitlement.entitled
    ? entitlement.inGrace
      ? "Past due (grace)"
      : entitlement.status === "trialing"
        ? "Trialing"
        : "Active"
    : entitlement.status
      ? entitlement.status
      : "No membership linked";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Your sign-in identity and billing portal. Auth is not the same as paid
          access.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--ink-muted)]">
            Email
          </h2>
          <p className="mt-1 text-lg">{email ?? "No verified email on file"}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--ink-muted)]">
            Plan
          </h2>
          <p className="mt-1 text-lg">{planLabel}</p>
          {entitlement.currentPeriodEnd ? (
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Period ends{" "}
              {new Date(entitlement.currentPeriodEnd).toLocaleDateString("en-US", {
                timeZone: "America/Chicago",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}{" "}
              (CT)
            </p>
          ) : null}
        </div>

        {entitlement.stripeCustomerId ? (
          <form action="/api/stripe/portal" method="POST">
            <button
              type="submit"
              className="rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Open Stripe Customer Portal
            </button>
          </form>
        ) : (
          <SoftCta
            title="No Stripe customer on this email"
            body="If you paid with a different email, write hello@ifn.community. To start a membership, use Become a member on ifn.community."
            showPortal={false}
          />
        )}

        <div className="pt-2">
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
