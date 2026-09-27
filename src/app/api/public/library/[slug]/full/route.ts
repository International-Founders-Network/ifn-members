import {
  publicLibraryDownload,
  publicLibraryOptions,
} from "@/lib/public-library-download";

type Params = { params: Promise<{ slug: string }> };

/** Landing full PDF: 302 to a short-lived signed URL while `landing_full` is on, else 403. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return publicLibraryDownload(req, slug, "full");
}

export function OPTIONS(req: Request) {
  return publicLibraryOptions(req);
}
