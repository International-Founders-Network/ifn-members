"use client";

import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

/**
 * Staff links are display only. Pages and /api/admin routes re-check the
 * permission on the server.
 */
export function SiteHeader({
  canViewMembers = false,
  canAdminLibrary = false,
}: {
  canViewMembers?: boolean;
  canAdminLibrary?: boolean;
}) {
  return (
    <header className="border-b border-[var(--ink-muted)]/15 bg-[var(--paper)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight text-[var(--ink)]">
          IFN<span className="text-[var(--crimson)]">.</span> Members
        </Link>
        <nav className="flex items-center gap-4 text-sm text-[var(--ink)]">
          <Show when="signed-in">
            <Link href="/library" className="hover:text-[var(--crimson)]">
              Library
            </Link>
            <Link href="/account" className="hover:text-[var(--crimson)]">
              Account
            </Link>
            {canViewMembers ? (
              <Link href="/admin/members" className="hover:text-[var(--crimson)]">
                View Members
              </Link>
            ) : null}
            {canAdminLibrary ? (
              <Link href="/admin/library" className="hover:text-[var(--crimson)]">
                Library Admin
              </Link>
            ) : null}
            <UserButton />
          </Show>
          <Show when="signed-out">
            <Link href="/sign-in" className="hover:text-[var(--crimson)]">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-[var(--crimson)] px-3 py-1.5 text-white hover:opacity-90"
            >
              Sign up
            </Link>
          </Show>
        </nav>
      </div>
    </header>
  );
}
