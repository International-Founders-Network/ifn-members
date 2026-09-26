import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkAdmin } from "@/lib/auth-helpers";
import { listMemberships } from "@/lib/membership";
import { toIso } from "@/lib/entitlement";

export default async function ViewMembersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = await isClerkAdmin();
  if (!admin) {
    return (
      <div className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Staff only</h1>
        <p className="mt-2 text-[var(--ink-muted)] leading-relaxed">
          View Members requires Clerk{" "}
          <code className="text-sm">publicMetadata.role = &quot;admin&quot;</code>.
          Ask Venkat to set that in the Clerk Dashboard for your user. Landing
          Google /admin is separate and unchanged.
        </p>
      </div>
    );
  }

  let rows: Awaited<ReturnType<typeof listMemberships>> = [];
  let error: string | null = null;
  try {
    rows = await listMemberships();
  } catch (e) {
    error =
      e instanceof Error && e.message === "database_not_configured"
        ? "Database is not configured (NETLIFY_DATABASE_URL)."
        : "Could not load memberships.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">View Members</h1>
        <p className="mt-2 text-[var(--ink-muted)]">
          Roster from Neon <code className="text-sm">memberships</code> (Stripe
          webhooks on landing). Not the landing form inbox.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-4 text-[var(--ink-muted)]">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--ink-muted)]/20 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ink-muted)]/15 bg-[var(--paper-deep)] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Period end</th>
                <th className="px-3 py-2 font-medium">Last event</th>
                <th className="px-3 py-2 font-medium">Customer</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-[var(--ink-muted)]">
                    No membership rows yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--ink-muted)]/10 last:border-0"
                  >
                    <td className="px-3 py-2">{row.email ?? "—"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">
                      {fmt(toIso(row.current_period_end))}
                    </td>
                    <td className="px-3 py-2">{fmt(toIso(row.last_event_at))}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.stripe_customer_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-[var(--ink-muted)]">
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
