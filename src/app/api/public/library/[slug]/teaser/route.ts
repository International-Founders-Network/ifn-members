import {
  publicLibraryDownload,
  publicLibraryOptions,
} from "@/lib/public-library-download";

type Params = { params: Promise<{ slug: string }> };

/** Landing teaser PDF: 302 to a short-lived signed URL while `teaser_public` is on, else 403. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return publicLibraryDownload(req, slug, "teaser");
}

export function OPTIONS(req: Request) {
  return publicLibraryOptions(req);
}
