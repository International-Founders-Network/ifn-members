"use client";

import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";

export function SignOutButton() {
  return (
    <ClerkSignOutButton>
      <button
        type="button"
        className="rounded-full border border-[var(--ink)]/20 px-4 py-2 text-sm font-medium hover:border-[var(--crimson)]"
      >
        Sign out
      </button>
    </ClerkSignOutButton>
  );
}
