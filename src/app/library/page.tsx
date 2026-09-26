import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MemberLibrary } from "@/components/library/member-library";
import { SoftCta } from "@/components/soft-cta";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { getLibraryAssetFlags } from "@/lib/library-assets";
import { PACK_A } from "@/lib/library-catalog";
import { defaultLibraryFlagsMap } from "@/lib/library-flags";
import { isMemberEntitled } from "@/lib/membership";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const email = await getVerifiedPrimaryEmail();
  const entitlement = email
    ? await isMemberEntitled(email)
    : { entitled: false as const, reason: "no_email" as const };

  // Member on (`downloadable`) only; teaserPublic never unlocks the full PDF.
  const assetFlags = entitlement.entitled
    ? await getLibraryAssetFlags()
    : defaultLibraryFlagsMap();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Pack A: practical founder guides. Full PDFs for entitled members when
          download is enabled.
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

      <MemberLibrary
        entitled={entitlement.entitled}
        items={PACK_A.map((item) => ({
          slug: item.slug,
          title: item.title,
          description: item.description,
          tag: item.tag,
          canDownload:
            entitlement.entitled && Boolean(assetFlags[item.slug]?.downloadable),
        }))}
      />
    </div>
  );
}
