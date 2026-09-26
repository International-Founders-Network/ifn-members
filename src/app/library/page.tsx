import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SoftCta } from "@/components/soft-cta";
import { PACK_A } from "@/lib/library-catalog";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { isMemberEntitled } from "@/lib/membership";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const email = await getVerifiedPrimaryEmail();
  const entitlement = email
    ? await isMemberEntitled(email)
    : { entitled: false as const, reason: "no_email" as const };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Pack A: practical founder guides. Full PDFs for entitled members.
        </p>
      </div>

      {!entitlement.entitled ? (
        <SoftCta
          title={
            entitlement.reason === "past_due_grace_expired"
              ? "Library paused while billing catches up"
              : "Library unlocks with membership"
          }
          body={
            entitlement.reason === "past_due_grace_expired"
              ? "Your past-due grace window has ended. Update billing from Account to reopen downloads, or write hello@ifn.community if something looks wrong."
              : "Sign-in alone does not open Pack A. Become a member on ifn.community, or contact hello@ifn.community if you already paid with a different email."
          }
          showMembership={entitlement.reason !== "past_due_grace_expired"}
          showPortal={
            entitlement.reason === "past_due_grace_expired" ||
            Boolean(entitlement.stripeCustomerId)
          }
        />
      ) : null}

      <ul className="space-y-4">
        {PACK_A.map((item) => (
          <li
            key={item.slug}
            className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
              {item.description}
            </p>
            {entitlement.entitled ? (
              <a
                href={`/api/library/${item.slug}/download`}
                className="mt-4 inline-flex rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Download PDF
              </a>
            ) : (
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                Available after membership is linked.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
