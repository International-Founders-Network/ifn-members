import { NextResponse } from "next/server";
import { listLibraryCatalogWithFlags } from "@/lib/library-assets";
import { buildPublicLibraryCatalog } from "@/lib/library-flags";
import { publicCorsHeaders } from "@/lib/public-cors";

/**
 * Public Pack A catalog for landing: title, description, member-on / teaser-on /
 * landing-full flags and object keys. No auth, no signed URLs, no secrets.
 * Lists PACK_A ∪ R2 uploads under `pack-a/` ∪ Neon rows (read-only; Admin seeds).
 * Missing row / DB error ⇒ all off; R2 unavailable ⇒ PACK_A + Neon rows.
 * Downloads go through `./[slug]/teaser` and `./[slug]/full`.
 */
export async function GET(req: Request) {
  const { items, flags } = await listLibraryCatalogWithFlags();
  return NextResponse.json(buildPublicLibraryCatalog(flags, items), {
    headers: {
      ...publicCorsHeaders(req.headers.get("origin")),
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: publicCorsHeaders(req.headers.get("origin")),
  });
}
