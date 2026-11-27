import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/auth-helpers";
import { isValidLibrarySlug } from "@/lib/library-catalog";
import { UnknownLibrarySlugError, setLibraryItemFlags } from "@/lib/library-assets";
import { parseLibraryFlagsPatch } from "@/lib/library-flags";

type Params = { params: Promise<{ slug: string }> };

/**
 * Admin flag save. `{ downloadable?, teaserPublic?, landingFull?, approvePublic?, denyPublic? }`.
 * `approvePublic: true` forces Public teaser ON and Landing full OFF; `denyPublic: true`
 * turns both public surfaces off. Public teaser and Landing full are mutually exclusive
 * (turning one ON forces the other OFF). Member download is independent. Omitted flags
 * keep their value. Slug must be PACK_A or have a Neon row (R2 uploads are seeded when
 * Admin lists them).
 */
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requireStaffPermission("library:admin");
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  if (!isValidLibrarySlug(slug)) {
    return NextResponse.json({ error: "Unknown library item" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = parseLibraryFlagsPatch(body);
  if (!patch) {
    return NextResponse.json(
      {
        error:
          "Body must include at least one boolean of downloadable, teaserPublic, landingFull, approvePublic: true or denyPublic: true (no contradictions, e.g. approvePublic with teaserPublic: false)",
      },
      { status: 400 },
    );
  }

  const { user, userId } = gate;
  const updatedBy =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    userId;

  try {
    const row = await setLibraryItemFlags(slug, patch, updatedBy);
    return NextResponse.json({
      slug: row.slug,
      downloadable: Boolean(row.downloadable),
      teaserPublic: Boolean(row.teaser_public),
      landingFull: Boolean(row.landing_full),
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
  } catch (e) {
    if (e instanceof UnknownLibrarySlugError) {
      return NextResponse.json({ error: "Unknown library item" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "database_not_configured") {
      return NextResponse.json(
        { error: "Database is not configured (NETLIFY_DATABASE_URL)." },
        { status: 503 },
      );
    }
    console.error(
      "setLibraryItemFlags failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    return NextResponse.json({ error: "Could not save toggle" }, { status: 500 });
  }
}
