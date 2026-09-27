import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { UnknownLibrarySlugError, setLibraryItemsFlags } from "@/lib/library-assets";
import { isValidLibrarySlug } from "@/lib/library-catalog";
import { parseLibraryBulkRequest } from "@/lib/library-flags";

/**
 * Admin bulk flag save:
 * `{ slugs: string[], patch: { downloadable?, teaserPublic?, landingFull?, approvePublic?, denyPublic? } }`.
 *
 * - `approvePublic: true` ⇒ Public teaser ON for every slug.
 * - `denyPublic: true` ⇒ Public teaser OFF and Landing full OFF (member download untouched).
 * - Omitted flags keep their stored value per slug. Max 100 slugs.
 *
 * All-or-nothing: one unknown slug (not PACK_A, no Neon row) ⇒ 404 and nothing is written.
 */
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await isClerkAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseLibraryBulkRequest(body, isValidLibrarySlug);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const user = await currentUser();
  const updatedBy =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    userId;

  try {
    const rows = await setLibraryItemsFlags(parsed.slugs, parsed.patch, updatedBy);
    return NextResponse.json({
      updated: rows.map((row) => ({
        slug: row.slug,
        downloadable: Boolean(row.downloadable),
        teaserPublic: Boolean(row.teaser_public),
        landingFull: Boolean(row.landing_full),
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      })),
    });
  } catch (e) {
    if (e instanceof UnknownLibrarySlugError) {
      return NextResponse.json(
        { error: "Unknown library items", unknownSlugs: e.slugs },
        { status: 404 },
      );
    }
    if (e instanceof Error && e.message === "database_not_configured") {
      return NextResponse.json(
        { error: "Database is not configured (NETLIFY_DATABASE_URL)." },
        { status: 503 },
      );
    }
    console.error(
      "setLibraryItemsFlags failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    return NextResponse.json({ error: "Could not save bulk change" }, { status: 500 });
  }
}
