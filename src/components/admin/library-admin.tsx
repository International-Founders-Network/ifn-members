"use client";

import { useMemo, useState } from "react";
import { Compass, Globe, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import {
  FilterChips,
  LIBRARY_PERSONAS,
  LibraryBrowseLayout,
  LibrarySearch,
  NoMatch,
  OUTLINE_BUTTON,
  PersonaTabs,
  PILL_NEUTRAL,
  PILL_OFF,
  PILL_ON,
  ResourceCard,
  ResultCount,
  SELECTION,
  StageSidebar,
  TEXT_LINK,
  type LibraryPersonaId,
} from "@ifn/ui";
import { PERSONA_ICONS, PERSONA_OPTIONS } from "@/components/library/member-library";
import type { AdminLibraryAsset } from "@/lib/library-assets";
import {
  ADMIN_STATUS_FILTERS,
  matchesAdminStatus,
  matchesLibraryQuery,
  type AdminStatusFilter,
} from "@/lib/library-filter";
import {
  MAX_BULK_SLUGS,
  type LibraryAssetFlags,
  type LibraryFlagsPatch,
} from "@/lib/library-flags";
import { libraryPlacementForSlug } from "@/lib/library-placement";

/** What the Admin PATCH accepts: flags plus the approve/deny-public shortcuts. */
type AdminFlagsRequest = LibraryFlagsPatch & { approvePublic?: true; denyPublic?: true };

type SavedFlags = LibraryAssetFlags & {
  slug: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

/** Sticky bar actions: label for the button/confirm and the bulk patch it sends. */
const BULK_ACTIONS: Array<{
  id: string;
  group: string;
  label: string;
  confirm: string;
  patch: AdminFlagsRequest;
}> = [
  { id: "member-on", group: "Member download", label: "On", confirm: "turn Member download ON", patch: { downloadable: true } },
  { id: "member-off", group: "Member download", label: "Off", confirm: "turn Member download OFF", patch: { downloadable: false } },
  { id: "teaser-on", group: "Public teaser", label: "On", confirm: "turn Public teaser ON (turns Landing full OFF)", patch: { teaserPublic: true } },
  { id: "teaser-off", group: "Public teaser", label: "Off", confirm: "turn Public teaser OFF", patch: { teaserPublic: false } },
  { id: "landing-on", group: "Landing full", label: "On", confirm: "turn Landing full download ON (turns Public teaser OFF; anyone can download the full PDF)", patch: { landingFull: true } },
  { id: "landing-off", group: "Landing full", label: "Off", confirm: "turn Landing full download OFF", patch: { landingFull: false } },
];

const BULK_GROUPS = [...new Set(BULK_ACTIONS.map((action) => action.group))];

/** Compact on/off row: label on the left, On/Off on the right, ink fill when on. */
function FlagSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${SELECTION.focus} ${
        checked ? SELECTION.on : SELECTION.off
      }`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={checked ? "text-[var(--paper)]" : "font-medium text-[var(--ink-muted)]"}
      >
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

function StatusPills({ item }: { item: AdminLibraryAsset }) {
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
      {item.teaserPublic ? <span className={PILL_ON}>Teaser</span> : null}
      {item.landingFull ? (
        <span className={PILL_ON}>
          <Globe size={12} aria-hidden="true" />
          Landing full
        </span>
      ) : null}
      {!anyOn ? <span className={PILL_OFF}>Off</span> : null}
    </>
  );
}

export function LibraryAdmin({ items }: { items: AdminLibraryAsset[] }) {
  const [rows, setRows] = useState(items);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<LibraryPersonaId>(LIBRARY_PERSONAS[0].id);
  const [stageId, setStageId] = useState<string>(LIBRARY_PERSONAS[0].stages[0].id);
  /** Showing files that have no persona/stage placement instead of a stage. */
  const [unplacedView, setUnplacedView] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<AdminStatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const persona = LIBRARY_PERSONAS.find((p) => p.id === personaId) ?? LIBRARY_PERSONAS[0];
  const stage = persona.stages.find((s) => s.id === stageId) ?? persona.stages[0];
  const PersonaIcon = PERSONA_ICONS[persona.id] ?? Compass;

  const placed = useMemo(
    () => rows.map((row) => ({ row, placement: libraryPlacementForSlug(row.slug) })),
    [rows],
  );
  const unplacedCount = placed.filter((entry) => !entry.placement).length;
  const showUnplaced = unplacedView && unplacedCount > 0;

  // Search runs inside the chosen persona and stage (or the unplaced set), then status.
  const searched = useMemo(
    () =>
      placed
        .filter(({ placement }) =>
          showUnplaced
            ? !placement
            : placement?.personaId === persona.id && placement.stageId === stage.id,
        )
        .map(({ row }) => row)
        .filter((row) => matchesLibraryQuery(row, searchQuery)),
    [placed, showUnplaced, persona.id, stage.id, searchQuery],
  );
  const visible = searched.filter((row) => matchesAdminStatus(row, status));
  const statusOptions = ADMIN_STATUS_FILTERS.map((option) => ({
    ...option,
    count: searched.filter((row) => matchesAdminStatus(row, option.id)).length,
  }));
  const activeFilterLabel =
    status === "all" ? null : ADMIN_STATUS_FILTERS.find((f) => f.id === status)!.label;
  const isFiltered = searchQuery.trim().length > 0 || status !== "all";

  const visibleSlugs = visible.map((row) => row.slug);
  const allVisibleSelected =
    visibleSlugs.length > 0 && visibleSlugs.every((slug) => selected.has(slug));
  const hiddenSelected = [...selected].filter((slug) => !visibleSlugs.includes(slug)).length;

  function clearAll() {
    setSearchQuery("");
    setStatus("all");
  }

  function handlePersonaChange(id: LibraryPersonaId) {
    const next = LIBRARY_PERSONAS.find((p) => p.id === id) ?? LIBRARY_PERSONAS[0];
    setPersonaId(next.id);
    setStageId(next.stages[0].id);
    setUnplacedView(false);
    setSearchQuery("");
  }

  function handleStageChange(id: string) {
    setStageId(id);
    setUnplacedView(false);
  }

  function toggleSelected(slug: string, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(slug);
      else copy.delete(slug);
      return copy;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => new Set([...prev, ...visibleSlugs]));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function applySaved(saved: SavedFlags[]) {
    const bySlug = new Map(saved.map((row) => [row.slug, row]));
    setRows((prev) =>
      prev.map((row) => {
        const data = bySlug.get(row.slug);
        return data
          ? {
              ...row,
              downloadable: Boolean(data.downloadable),
              teaserPublic: Boolean(data.teaserPublic),
              landingFull: Boolean(data.landingFull),
              updated_at: data.updated_at ?? row.updated_at,
              updated_by: data.updated_by ?? row.updated_by,
            }
          : row;
      }),
    );
  }

  /** Sends the selection in chunks of MAX_BULK_SLUGS; stops at the first failed chunk. */
  async function bulkSave(body: AdminFlagsRequest, description: string) {
    const slugs = rows.map((row) => row.slug).filter((slug) => selected.has(slug));
    if (slugs.length === 0) return;
    const noun = slugs.length === 1 ? "file" : "files";
    if (!window.confirm(`${description} for ${slugs.length} selected ${noun}?`)) return;

    setBulkPending(true);
    setError(null);
    setNotice(null);
    let saved = 0;
    try {
      for (let i = 0; i < slugs.length; i += MAX_BULK_SLUGS) {
        const chunk = slugs.slice(i, i + MAX_BULK_SLUGS);
        const res = await fetch("/api/admin/library/flags/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slugs: chunk, patch: body }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          updated?: SavedFlags[];
          error?: string;
          unknownSlugs?: string[];
        };
        if (!res.ok) {
          const unknown = data.unknownSlugs?.length ? ` (${data.unknownSlugs.join(", ")})` : "";
          setError(
            `Bulk change stopped after ${saved} of ${slugs.length}: ${
              data.error ?? `Save failed (${res.status})`
            }${unknown}`,
          );
          return;
        }
        applySaved(data.updated ?? []);
        saved += chunk.length;
      }
      setNotice(`Saved: ${description.toLowerCase()} for ${saved} ${noun}.`);
    } catch {
      setError(`Network error during bulk change (${saved} of ${slugs.length} saved).`);
    } finally {
      setBulkPending(false);
    }
  }

  async function save(slug: string, body: AdminFlagsRequest) {
    setPending(slug);
    setError(null);
    setNotice(null);
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
      applySaved([{ ...data, slug } as SavedFlags]);
    } catch {
      setError("Network error saving flag.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <LibraryBrowseLayout
        personas={
          <>
            <PersonaTabs options={PERSONA_OPTIONS} value={persona.id} onChange={handlePersonaChange} />
            <div className="mx-auto w-full max-w-xl">
              <LibrarySearch
                id="admin-library-search"
                label={`Search files for ${persona.name}`}
                placeholder={`Search ${persona.name} files`}
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
          </>
        }
        sidebar={
          <>
            <StageSidebar stages={persona.stages} value={stage.id} onChange={handleStageChange} />
            {unplacedCount > 0 ? (
              <div className="px-8 pb-6">
                <button
                  type="button"
                  aria-pressed={showUnplaced}
                  onClick={() => setUnplacedView((prev) => !prev)}
                  className={TEXT_LINK}
                >
                  {unplacedCount} not on a stage
                </button>
              </div>
            ) : null}
          </>
        }
      >
        <div className="mb-8 space-y-3">
          {showUnplaced ? (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Not on a stage</h2>
              <p className="max-w-md text-[var(--ink-muted)]">
                These files have no persona or stage yet.
              </p>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] px-3 py-1 text-xs font-bold uppercase tracking-wide">
                <PersonaIcon size={14} aria-hidden="true" />
                {persona.name}
              </p>
              <h2 className="text-2xl font-bold tracking-tight">{stage.name}</h2>
              <p className="max-w-md text-[var(--ink-muted)]">{stage.description}</p>
            </>
          )}
          <ResultCount shown={visible.length} isFiltered={isFiltered} noun="file" />
          <div className="pt-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--ink-muted)]">
              Status
            </p>
            <FilterChips
              label="Filter by status"
              options={statusOptions}
              value={status}
              onChange={setStatus}
            />
          </div>
          {visible.length > 0 ? (
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={allVisibleSelected}
              className={`${TEXT_LINK} disabled:cursor-default disabled:opacity-60`}
            >
              Select all shown ({visible.length})
            </button>
          ) : null}
        </div>

        {notice ? (
          <p
            role="status"
            className="mb-6 rounded-xl border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] px-4 py-3 text-sm text-[var(--ink)]"
          >
            {notice}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <NoMatch
            query={searchQuery}
            filterLabel={activeFilterLabel}
            noun="file"
            titleAs="h3"
            description={
              isFiltered || showUnplaced
                ? undefined
                : <>No files for {stage.name} yet. Try another stage.</>
            }
            onClear={clearAll}
          />
        ) : (
          // Same card grid as the member Library.
          <div className="@container">
            <ul className="grid list-none grid-cols-1 gap-6 p-0 @md:grid-cols-2 @2xl:grid-cols-3">
              {visible.map((item) => {
                const busy = pending === item.slug || bulkPending;
                const isSelected = selected.has(item.slug);
                const previewBase = `/api/admin/library/${item.slug}/preview`;
                return (
                  <ResourceCard
                    key={item.slug}
                    slug={item.slug}
                    title={item.title}
                    description={item.description}
                    pills={<StatusPills item={item} />}
                    selected={isSelected}
                    leading={
                      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelected(item.slug, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-[var(--ink)]"
                        />
                        <span className="sr-only">Select {item.title}</span>
                      </label>
                    }
                    footer={
                      item.objectKey || item.teaserObjectKey ? (
                        <div className="flex flex-wrap gap-x-6">
                          {item.objectKey ? (
                            <a
                              href={`${previewBase}?kind=full`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={TEXT_LINK}
                            >
                              {item.kind === "xlsx" ? "Preview workbook" : "Preview"}
                              <span className="sr-only"> {item.title} (opens in a new tab)</span>
                            </a>
                          ) : null}
                          {item.teaserObjectKey ? (
                            <a
                              href={`${previewBase}?kind=teaser`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={TEXT_LINK}
                            >
                              Teaser
                              <span className="sr-only"> for {item.title} (opens in a new tab)</span>
                            </a>
                          ) : null}
                        </div>
                      ) : null
                    }
                  >
                    <div role="group" aria-label={`Approve ${item.title}`} className="mb-4 space-y-2">
                      <FlagSwitch
                        label="Public teaser"
                        checked={item.teaserPublic}
                        disabled={busy}
                        onChange={(next) => void save(item.slug, { teaserPublic: next })}
                      />
                      <FlagSwitch
                        label="Member download"
                        checked={item.downloadable}
                        disabled={busy}
                        onChange={(next) => void save(item.slug, { downloadable: next })}
                      />
                      <FlagSwitch
                        label="Landing full"
                        checked={item.landingFull}
                        disabled={busy}
                        onChange={(next) => void save(item.slug, { landingFull: next })}
                      />
                    </div>
                  </ResourceCard>
                );
              })}
            </ul>
          </div>
        )}
      </LibraryBrowseLayout>

      {selected.size > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions for selected files"
          className="sticky bottom-4 z-10 space-y-2 rounded-2xl border border-[var(--ink)] bg-white p-4 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm font-semibold text-[var(--ink)]">
              {selected.size} selected
              {hiddenSelected > 0 ? (
                <span className="font-normal text-[var(--ink-muted)]">
                  {" "}({hiddenSelected} not shown)
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkPending}
              className={TEXT_LINK}
            >
              Clear selection
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                void bulkSave({ approvePublic: true }, "Approve public (Public teaser ON, Landing full OFF)")
              }
              className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--crimson)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60 ${SELECTION.focus}`}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Approve public
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                void bulkSave(
                  { denyPublic: true },
                  "Deny public (Public teaser and Landing full OFF)",
                )
              }
              className={OUTLINE_BUTTON}
            >
              <ShieldOff size={16} aria-hidden="true" />
              Deny public
            </button>
            {BULK_GROUPS.map((group) => (
              <div
                key={group}
                role="group"
                aria-label={group}
                className="flex items-center gap-1.5"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                  {group}
                </span>
                {BULK_ACTIONS.filter((action) => action.group === group).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={bulkPending}
                    onClick={() =>
                      void bulkSave(
                        action.patch,
                        action.confirm.charAt(0).toUpperCase() + action.confirm.slice(1),
                      )
                    }
                    className={OUTLINE_BUTTON}
                  >
                    {action.label}
                    <span className="sr-only"> {group}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
