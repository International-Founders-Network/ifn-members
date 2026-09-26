import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { resolveLibraryItem } from "@/lib/library-assets";
import { teaserObjectKey } from "@/lib/library-catalog";
import { createSignedUrlForExistingObject } from "@/lib/storage";

type Params = { params: Promise<{ slug: string }> };

/**
 * Admin review-in-place: `?kind=full|teaser` → 302 to a 5-minute signed R2 URL.
 * Ignores every surface flag (admins may always preview). Missing object ⇒ 403
 * `{ reason: "object_missing" }` naming the key.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await isClerkAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { slug } = await params;
  const item = await resolveLibraryItem(slug);
  if (!item) {
    return NextResponse.json({ error: "Unknown library item" }, { status: 404 });
  }

  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "full" && kind !== "teaser") {
    return NextResponse.json(
      { error: "Query kind must be full or teaser" },
      { status: 400 },
    );
  }

  const objectKey = kind === "full" ? item.objectKey : teaserObjectKey(item.slug);
  const signed = await createSignedUrlForExistingObject(objectKey);
  if (!signed.ok) {
    return NextResponse.json(
      { error: signed.error, reason: signed.reason },
      { status: signed.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const res = NextResponse.redirect(signed.url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
