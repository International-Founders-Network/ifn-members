import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVerifiedPrimaryEmail } from "@/lib/auth-helpers";
import { isLibraryItemDownloadable } from "@/lib/library-assets";
import { getLibraryItem } from "@/lib/library-catalog";
import { isMemberEntitled } from "@/lib/membership";
import { createSignedDownloadUrl } from "@/lib/storage";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const item = getLibraryItem(slug);
  if (!item) {
    return NextResponse.json({ error: "Unknown library item" }, { status: 404 });
  }

  const email = await getVerifiedPrimaryEmail();
  if (!email) {
    return NextResponse.json(
      {
        error:
          "No verified email on this account. Contact hello@ifn.community if you need help linking membership.",
      },
      { status: 403 },
    );
  }

  const entitlement = await isMemberEntitled(email);
  if (!entitlement.entitled) {
    return NextResponse.json(
      {
        error:
          entitlement.reason === "past_due_grace_expired"
            ? "Membership past due; grace ended. Update billing from Account."
            : "Membership required for downloads. Become a member at ifn.community/membership or contact hello@ifn.community.",
        reason: entitlement.reason ?? "membership_not_active",
      },
      { status: 403 },
    );
  }

  const downloadable = await isLibraryItemDownloadable(item.slug);
  if (!downloadable) {
    return NextResponse.json(
      {
        error: "Download is not enabled for this file yet.",
        reason: "download_disabled",
      },
      { status: 403 },
    );
  }

  const signed = await createSignedDownloadUrl(item.objectKey);
  if (!signed.ok) {
    return NextResponse.json(
      { error: signed.reason, reason: "storage_not_configured" },
      { status: signed.status },
    );
  }

  return NextResponse.redirect(signed.url, 302);
}
