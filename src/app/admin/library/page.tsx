import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LibraryDownloadToggles } from "@/components/admin/library-download-toggles";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { listLibraryAssetsForAdmin } from "@/lib/library-assets";

export default async function AdminLibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = await isClerkAdmin();
  if (!admin) {
    return (
      <div className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Staff only</h1>
        <p className="mt-2 text-[var(--ink-muted)] leading-relaxed">
          Library Admin requires Clerk{" "}
          <code className="text-sm">publicMetadata.role = &quot;admin&quot;</code>.
          Ask Venkat to set that in the Clerk Dashboard for your user.
        </p>
      </div>
    );
  }

  let items: Awaited<ReturnType<typeof listLibraryAssetsForAdmin>> = [];
  let error: string | null = null;
  try {
    items = await listLibraryAssetsForAdmin();
  } catch {
    error = "Could not load library asset settings.";
  }

  const dbMissing = !process.env.NETLIFY_DATABASE_URL?.trim() && !process.env.DATABASE_URL?.trim();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--ink-muted)]">
          <Link href="/admin/members" className="hover:text-[var(--crimson)]">
            View Members
          </Link>
          {" · "}
          Library
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Library Admin</h1>
        <p className="mt-2 text-[var(--ink-muted)] leading-relaxed">
          Per-file download gate for Pack A. Default is{" "}
          <strong>off</strong> until you enable a PDF. Toggle works even if the
          object is not on R2 yet — members still cannot download until both the
          flag is on and storage serves the file.
        </p>
      </div>

      {dbMissing ? (
        <p className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-4 text-[var(--ink-muted)]">
          Database is not configured (NETLIFY_DATABASE_URL). Toggles cannot be
          saved until Neon is wired.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-4 text-[var(--ink-muted)]">
          {error}
        </p>
      ) : (
        <LibraryDownloadToggles items={items} />
      )}
    </div>
  );
}
