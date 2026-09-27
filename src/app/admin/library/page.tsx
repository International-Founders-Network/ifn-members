import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LibraryAdmin } from "@/components/admin/library-admin";
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
          Three independent per-file flags for every library asset, all{" "}
          <strong>off</strong> by default (a file with no saved row is fully off).
          Off always wins for that surface. Every serial in the registry, and every
          file Content uploads to R2 as{" "}
          <code className="text-sm">library/&lt;NNN&gt;-&lt;slug&gt;/v1.1-member-&lt;slug&gt;.pdf</code>,{" "}
          <code className="text-sm">v1.1-teaser-&lt;slug&gt;.pdf</code> or{" "}
          <code className="text-sm">v1.1-&lt;slug&gt;.xlsx</code>, shows up here on the next load,
          with all flags off.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[var(--ink-muted)] leading-relaxed">
          <li>
            <strong className="text-[var(--ink)]">Approve public</strong> is the
            primary action: it turns <strong>Public teaser</strong> ON
            automatically. You can switch the teaser off afterward.
          </li>
          <li>
            <strong className="text-[var(--ink)]">Bulk</strong>: tick files (or{" "}
            <strong>Select all</strong> for the current search and filter), then use
            the bar at the bottom. <strong>Deny public</strong> turns Public teaser
            and Landing full off; Member download is left as is.
          </li>
          <li>
            <strong className="text-[var(--ink)]">Public teaser</strong>: landing
            may offer the teaser only. It never unlocks the full PDF.
          </li>
          <li>
            <strong className="text-[var(--ink)]">Member download</strong>:
            entitled members download the full PDF here.
          </li>
          <li>
            <strong className="text-[var(--ink)]">Landing full download</strong>:
            anyone on ifn.community may download the full PDF, no sign-in.
          </li>
        </ul>
        <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
          Use <strong>Preview full PDF</strong> and <strong>Preview teaser PDF</strong>{" "}
          to review a file before switching anything on; previews ignore the flags
          and open a 5-minute signed link. Member file and teaser share one serial
          folder:{" "}
          <code className="text-sm">library/001-visa-pathways/v1.1-teaser-visa-pathways.pdf</code>.
          Workbook-only assets have no teaser. Flags
          save even if the object is not on R2 yet; nothing downloads until the
          flag is on and storage serves the file. This page is the only Library
          source of truth; landing has no Library Admin and reads{" "}
          <code className="text-sm">/api/public/library</code>.
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
        <LibraryAdmin items={items} />
      )}
    </div>
  );
}
