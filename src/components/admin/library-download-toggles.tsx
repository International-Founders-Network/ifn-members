"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LibraryFlagsPatch } from "@/lib/library-flags";

export type AdminLibraryItem = {
  slug: string;
  title: string;
  description: string;
  objectKey: string;
  /** Member on */
  downloadable: boolean;
  /** Teaser on */
  teaserPublic: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

function fmtChicago(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LibraryDownloadToggles({ items }: { items: AdminLibraryItem[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(slug: string, patch: LibraryFlagsPatch) {
    setPending(slug);
    setError(null);
    try {
      const res = await fetch(`/api/admin/library/${slug}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        downloadable?: boolean;
        teaserPublic?: boolean;
        updated_at?: string | null;
        updated_by?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.slug === slug
            ? {
                ...row,
                downloadable: Boolean(data.downloadable),
                teaserPublic: Boolean(data.teaserPublic),
                updated_at: data.updated_at ?? row.updated_at,
                updated_by: data.updated_by ?? row.updated_by,
              }
            : row,
        ),
      );
      router.refresh();
    } catch {
      setError("Network error saving toggle.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="space-y-4">
        {rows.map((item) => {
          const busy = pending === item.slug;
          return (
            <li
              key={item.slug}
              className="rounded-xl border border-[var(--ink-muted)]/20 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">
                    {item.description}
                  </p>
                  <p className="mt-2 font-mono text-xs text-[var(--ink-muted)]">
                    slug: {item.slug} · R2: {item.objectKey}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Updated {fmtChicago(item.updated_at)}
                    {item.updated_by ? ` · ${item.updated_by}` : ""}
                    <span className="ml-1">(CT)</span>
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-full border border-[var(--ink-muted)]/20 px-4 py-2 text-sm">
                    <span className="text-[var(--ink-muted)]">
                      {item.downloadable ? "Member download" : "Member download off"}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--crimson)]"
                      checked={item.downloadable}
                      disabled={busy}
                      onChange={(e) =>
                        void save(item.slug, { downloadable: e.target.checked })
                      }
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-full border border-[var(--ink-muted)]/20 px-4 py-2 text-sm">
                    <span className="text-[var(--ink-muted)]">Public teaser</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--crimson)]"
                      checked={item.teaserPublic}
                      disabled={busy}
                      onChange={(e) =>
                        void save(item.slug, { teaserPublic: e.target.checked })
                      }
                    />
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
