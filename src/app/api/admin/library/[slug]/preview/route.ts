import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { resolveLibraryItem } from "@/lib/library-assets";
import { createSignedUrlForExistingObject } from "@/lib/storage";

type Params = { params: Promise<{ slug: string }> };

/**
 * Admin review / download: `?kind=full|teaser` → 302 to a 5-minute signed R2 URL
 * (`full` is the workbook for xlsx-only assets; they have no teaser).
 * Optional `disposition=inline|attachment` (default `inline` so Preview opens in-tab;
 * pass `attachment` for Download). Ignores every surface flag. Missing object ⇒ 403
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

  const dispositionParam = new URL(req.url).searchParams.get("disposition");
  const disposition =
    dispositionParam === "attachment" ? "attachment" : "inline";

  const objectKey = kind === "full" ? item.objectKey : item.teaserObjectKey;
  if (!objectKey) {
    return NextResponse.json(
      { error: `No ${kind} object for this item on R2.`, reason: "object_missing" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const signed = await createSignedUrlForExistingObject(objectKey, undefined, {
    disposition,
  });
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
