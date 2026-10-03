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
        <p className="mt-3 max-w-2xl text-[var(--ink-muted)] leading-relaxed">
          Decide where each library file can be downloaded. Every file has three
          switches, and they all start off until you turn them on. Preview and
          Download ignore the switches and open a short-lived link, so you can check
          a file before you share it.
        </p>
      </div>

      <section aria-label="What each switch does" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-5">
          <h2 className="text-base font-semibold">Member download</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
            Entitled members can download the full PDF from this site. It works on
            its own, separate from the two public switches.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] p-5 md:col-span-2">
          <p className="text-sm font-semibold text-[var(--crimson)]">
            Public teaser and Landing full cannot both be on.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--ink-muted)]/20 bg-white p-4">
              <h2 className="text-base font-semibold">Public teaser</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
                The public site offers the teaser PDF. Turning it on turns Landing
                full off.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--ink-muted)]/20 bg-white p-4">
              <h2 className="text-base font-semibold">Landing full</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
                Anyone on the public site can download the full PDF without signing
                in. Turning it on turns Public teaser off.
              </p>
            </div>
          </div>
        </div>
      </section>

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
