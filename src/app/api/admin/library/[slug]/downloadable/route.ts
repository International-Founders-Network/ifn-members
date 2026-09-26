import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { getLibraryItem } from "@/lib/library-catalog";
import { setLibraryItemDownloadable } from "@/lib/library-assets";

type Params = { params: Promise<{ slug: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await isClerkAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { slug } = await params;
  if (!getLibraryItem(slug)) {
    return NextResponse.json({ error: "Unknown library item" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const downloadable =
    typeof body === "object" &&
    body !== null &&
    "downloadable" in body &&
    typeof (body as { downloadable: unknown }).downloadable === "boolean"
      ? (body as { downloadable: boolean }).downloadable
      : null;

  if (downloadable === null) {
    return NextResponse.json(
      { error: "Body must include boolean downloadable" },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const updatedBy =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    userId;

  try {
    const row = await setLibraryItemDownloadable(slug, downloadable, updatedBy);
    return NextResponse.json({
      slug: row.slug,
      downloadable: Boolean(row.downloadable),
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "database_not_configured") {
      return NextResponse.json(
        { error: "Database is not configured (NETLIFY_DATABASE_URL)." },
        { status: 503 },
      );
    }
    console.error(
      "setLibraryItemDownloadable failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    return NextResponse.json({ error: "Could not save toggle" }, { status: 500 });
  }
}
