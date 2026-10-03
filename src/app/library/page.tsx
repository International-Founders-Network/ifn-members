import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MemberLibrary } from "@/components/library/member-library";
import { SoftCta } from "@/components/soft-cta";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { listLibraryCatalogWithFlags } from "@/lib/library-assets";
import { libraryPlacementForSlug } from "@/lib/library-placement";
import { isMemberEntitled } from "@/lib/membership";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const email = await getVerifiedPrimaryEmail();
  const entitlement = email
    ? await isMemberEntitled(email)
    : { entitled: false as const, reason: "no_email" as const };

  // Every uploaded asset is listed; Member on (`downloadable`) alone gates the full PDF.
  // teaserPublic / landingFull never unlock it here.
  const { items, flags: assetFlags } = await listLibraryCatalogWithFlags();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Practical founder guides. Pick who you are and your stage. Full PDFs
          for entitled members when download is enabled.
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
        items={items.map((item) => ({
          slug: item.slug,
          title: item.title,
          description: item.description,
          tag: item.tag,
          canDownload:
            entitlement.entitled && Boolean(assetFlags[item.slug]?.downloadable),
          ...libraryPlacementForSlug(item.slug),
        }))}
      />
    </div>
  );
}
