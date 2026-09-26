"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Globe, Lock, ShieldCheck } from "lucide-react";
import {
  FilterChips,
  LibrarySearch,
  NoMatch,
  PILL_NEUTRAL,
  PILL_OFF,
  PILL_ON,
  ResourceCard,
  ResultCount,
  SELECTION,
  TEXT_LINK,
} from "@/components/library/resource-ui";
import type { AdminLibraryAsset } from "@/lib/library-assets";
import {
  ADMIN_STATUS_FILTERS,
  matchesAdminStatus,
  matchesLibraryQuery,
  type AdminStatusFilter,
} from "@/lib/library-filter";
import type { LibraryAssetFlags, LibraryFlagsPatch } from "@/lib/library-flags";

/** What the Admin PATCH accepts: flags plus the approve-public shortcut. */
type AdminFlagsRequest = LibraryFlagsPatch & { approvePublic?: true };

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

/**
 * Large on/off row: the whole row is the `role="switch"` target, and on uses the
 * same ink fill as the Resources selection chips.
 */
function FlagSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-desc`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${SELECTION.focus} ${
        checked ? SELECTION.on : SELECTION.off
      }`}
    >
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-sm font-semibold">
          {label}
        </span>
        <span
          id={`${id}-desc`}
          className={`mt-0.5 block text-xs leading-relaxed ${
            checked ? "text-[var(--paper)]/80" : "text-[var(--ink-muted)]"
          }`}
        >
          {description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2" aria-hidden="true">
        <span className="w-7 text-right text-xs font-bold uppercase tracking-wide">
          {checked ? "On" : "Off"}
        </span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? "bg-[var(--paper)]" : "bg-[var(--ink-muted)]/35"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${
              checked ? "translate-x-[22px] bg-[var(--ink)]" : "translate-x-0.5 bg-white"
            }`}
          />
        </span>
      </span>
    </button>
  );
}

function StatusPills({ item }: { item: LibraryAssetFlags & { tag: string } }) {
  const anyOn = item.downloadable || item.teaserPublic || item.landingFull;
  return (
    <>
      <span className={PILL_NEUTRAL}>{item.tag}</span>
      {item.downloadable ? (
        <span className={PILL_ON}>
          <Lock size={12} aria-hidden="true" />
          Members
        </span>
      ) : null}
      {item.teaserPublic ? <span className={PILL_ON}>Teaser public</span> : null}
      {item.landingFull ? (
        <span className={PILL_ON}>
          <Globe size={12} aria-hidden="true" />
          Landing full
        </span>
      ) : null}
      {!anyOn ? <span className={PILL_OFF}>Not live</span> : null}
    </>
  );
}

export function LibraryAdmin({ items }: { items: AdminLibraryAsset[] }) {
  const [rows, setRows] = useState(items);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<AdminStatusFilter>("all");

  const searched = useMemo(
    () => rows.filter((row) => matchesLibraryQuery(row, searchQuery)),
    [rows, searchQuery],
  );
  const visible = useMemo(
    () => searched.filter((row) => matchesAdminStatus(row, status)),
    [searched, status],
  );
  const statusOptions = ADMIN_STATUS_FILTERS.map((option) => ({
    ...option,
    count: searched.filter((row) => matchesAdminStatus(row, option.id)).length,
  }));
  const activeFilterLabel =
    status === "all" ? null : ADMIN_STATUS_FILTERS.find((f) => f.id === status)!.label;
  const isFiltered = searchQuery.trim().length > 0 || status !== "all";

  function clearAll() {
    setSearchQuery("");
    setStatus("all");
  }

  async function save(slug: string, body: AdminFlagsRequest) {
    setPending(slug);
    setError(null);
    try {
      const res = await fetch(`/api/admin/library/${slug}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<LibraryAssetFlags> & {
        error?: string;
        updated_at?: string | null;
        updated_by?: string | null;
      };
      if (!res.ok) {
        const title = rows.find((row) => row.slug === slug)?.title ?? slug;
        setError(`${title}: ${data.error ?? `Save failed (${res.status})`}`);
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.slug === slug
            ? {
                ...row,
                downloadable: Boolean(data.downloadable),
                teaserPublic: Boolean(data.teaserPublic),
                landingFull: Boolean(data.landingFull),
                updated_at: data.updated_at ?? row.updated_at,
                updated_by: data.updated_by ?? row.updated_by,
              }
            : row,
        ),
      );
    } catch {
      setError("Network error saving flag.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <LibrarySearch
          id="admin-library-search"
          label="Search library files by title or slug"
          placeholder="Search by title or slug"
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <FilterChips
          label="Filter by status"
          options={statusOptions}
          value={status}
          onChange={setStatus}
        />
        <ResultCount shown={visible.length} isFiltered={isFiltered} />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <NoMatch query={searchQuery} filterLabel={activeFilterLabel} onClear={clearAll} />
      ) : (
        <ul className="grid list-none gap-6 p-0">
          {visible.map((item) => {
            const busy = pending === item.slug;
            const previewBase = `/api/admin/library/${item.slug}/preview`;
            return (
              <ResourceCard
                key={item.slug}
                slug={item.slug}
                title={item.title}
                description={item.description}
                pills={<StatusPills item={item} />}
                footer={
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-x-6">
                      <a
                        href={`${previewBase}?kind=full`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={TEXT_LINK}
                      >
                        Preview full PDF
                        <ExternalLink size={16} aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      <a
                        href={`${previewBase}?kind=teaser`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={TEXT_LINK}
                      >
                        Preview teaser PDF
                        <ExternalLink size={16} aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </div>
                    <p className="font-mono text-xs text-[var(--ink-muted)]">
                      {item.slug} · {item.objectKey} · {item.teaserObjectKey}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Updated {fmtChicago(item.updated_at)}
                      {item.updated_by ? ` · ${item.updated_by}` : ""}
                      <span className="ml-1">(CT)</span>
                    </p>
                  </div>
                }
              >
                <div className="mb-6 space-y-3">
                  {item.teaserPublic ? (
                    <p className="flex items-start gap-3 rounded-xl border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] px-4 py-3 text-sm text-[var(--ink)]">
                      <CheckCircle2 size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span>
                        <span className="block font-semibold">Approved for public</span>
                        <span className="block text-xs leading-relaxed text-[var(--ink-muted)]">
                          Public teaser is on. Switch it off below to withdraw.
                        </span>
                      </span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(item.slug, { approvePublic: true })}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl bg-[var(--crimson)] px-4 py-3 text-left text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60 ${SELECTION.focus}`}
                    >
                      <ShieldCheck size={20} aria-hidden="true" className="shrink-0" />
                      <span>
                        <span className="block text-sm font-semibold">Approve public</span>
                        <span className="block text-xs leading-relaxed text-white/85">
                          Turns Public teaser ON. You can switch it off afterward.
                        </span>
                      </span>
                    </button>
                  )}

                  <FlagSwitch
                    id={`${item.slug}-teaser`}
                    label="Public teaser"
                    description="Landing may offer the teaser PDF. Never unlocks the full PDF."
                    checked={item.teaserPublic}
                    disabled={busy}
                    onChange={(next) => void save(item.slug, { teaserPublic: next })}
                  />
                  <FlagSwitch
                    id={`${item.slug}-member`}
                    label="Member download"
                    description="Entitled members download the full PDF on members.ifn.community."
                    checked={item.downloadable}
                    disabled={busy}
                    onChange={(next) => void save(item.slug, { downloadable: next })}
                  />
                  <FlagSwitch
                    id={`${item.slug}-landing-full`}
                    label="Landing full download"
                    description="Anyone on ifn.community may download the full PDF, no sign-in."
                    checked={item.landingFull}
                    disabled={busy}
                    onChange={(next) => void save(item.slug, { landingFull: next })}
                  />
                </div>
              </ResourceCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
