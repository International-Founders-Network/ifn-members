import { NextResponse } from "next/server";
import {
  isLibraryItemLandingFull,
  isLibraryItemTeaserPublic,
} from "@/lib/library-assets";
import {
  getLibraryItem,
  teaserObjectKey,
  type LibraryItem,
} from "@/lib/library-catalog";
import { publicCorsHeaders } from "@/lib/public-cors";
import { createSignedUrlForExistingObject } from "@/lib/storage";

export type PublicDownloadKind = "teaser" | "full";

const SURFACES = {
  teaser: {
    isOn: isLibraryItemTeaserPublic,
    objectKey: (item: LibraryItem) => teaserObjectKey(item.slug),
    offError: "Public teaser is not enabled for this file.",
    offReason: "teaser_disabled",
  },
  full: {
    isOn: isLibraryItemLandingFull,
    objectKey: (item: LibraryItem) => item.objectKey,
    offError: "Public full download is not enabled for this file.",
    offReason: "landing_full_disabled",
  },
} as const;

/**
 * Landing download (no auth): 302 to a 5-minute signed URL only while the surface flag
 * is on. Off, unknown slug, DB error ⇒ no URL (fail closed). CORS matches the catalog.
 */
export async function publicLibraryDownload(
  req: Request,
  slug: string,
  kind: PublicDownloadKind,
): Promise<NextResponse> {
  const headers = {
    ...publicCorsHeaders(req.headers.get("origin")),
    "Cache-Control": "no-store",
  };

  const item = getLibraryItem(slug);
  if (!item) {
    return NextResponse.json(
      { error: "Unknown library item", reason: "unknown_slug" },
      { status: 404, headers },
    );
  }

  const surface = SURFACES[kind];
  if (!(await surface.isOn(item.slug))) {
    return NextResponse.json(
      { error: surface.offError, reason: surface.offReason },
      { status: 403, headers },
    );
  }

  const signed = await createSignedUrlForExistingObject(
    surface.objectKey(item),
  );
  if (!signed.ok) {
    return NextResponse.json(
      { error: signed.error, reason: signed.reason },
      { status: signed.status, headers },
    );
  }

  const res = NextResponse.redirect(signed.url, 302);
  for (const [name, value] of Object.entries(headers)) {
    res.headers.set(name, value);
  }
  return res;
}

export function publicLibraryOptions(req: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: publicCorsHeaders(req.headers.get("origin")),
  });
}
