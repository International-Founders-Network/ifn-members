import type { ReactNode } from "react";
import { Building, FileText, Map as MapIcon, Scale, Search } from "lucide-react";

/**
 * Library building blocks ported from landing `Resources.tsx` so Admin, members and
 * landing share one hierarchy: search, pressed filter chips, icon-box cards with
 * pills, bold title, muted description and a footer action row.
 *
 * Landing tokens map onto members vars: paper → `--paper`/white, band → `--paper-deep`,
 * ink → `--ink`, muted → `--ink-muted`, rule/edge → `--ink-muted` at low alpha.
 */

/** Same icons landing uses for these ids in `resourcesData.ts`; FileText otherwise. */
function LibraryIcon({ slug }: { slug: string }) {
  const props = { size: 24, "aria-hidden": true } as const;
  switch (slug) {
    case "visa-pathways":
      return <Scale {...props} />;
    case "entity-selection":
      return <Building {...props} />;
    case "austin-ecosystem-map":
      return <MapIcon {...props} />;
    default:
      return <FileText {...props} />;
  }
}

/**
 * Selection language from landing: `--ink` fill when chosen, paper over a hairline
 * when not. State is also carried by `aria-pressed` / `aria-checked`.
 */
export const SELECTION = {
  on: "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]",
  off:
    "border-[var(--ink-muted)]/30 bg-white text-[var(--ink)] hover:border-[var(--ink-muted)]/70",
  focus:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]",
} as const;

export function toggleClasses(isSelected: boolean, shape: string): string {
  return [
    "border transition-colors",
    SELECTION.focus,
    shape,
    isSelected ? SELECTION.on : SELECTION.off,
  ].join(" ");
}

/** Card-footer links that read as links: ink, underlined, never a button. */
export const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-2 rounded px-1 text-sm font-semibold text-[var(--ink)] " +
  "underline underline-offset-4 transition-colors hover:text-[var(--crimson)] " +
  SELECTION.focus;

export const OUTLINE_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--ink)]/20 " +
  "px-4 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--crimson)] " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  SELECTION.focus;

const PILL = "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide";
export const PILL_NEUTRAL = `${PILL} border border-[var(--ink-muted)]/25 bg-[var(--paper-deep)] text-[var(--ink)]`;
export const PILL_ON = `${PILL} inline-flex items-center gap-1 bg-[var(--ink)] text-[var(--paper)]`;
export const PILL_OFF = `${PILL} border border-dashed border-[var(--ink-muted)]/40 text-[var(--ink-muted)]`;

export function LibrarySearch({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--ink-muted)]">
          <Search size={20} aria-hidden="true" />
        </div>
        <input
          id={id}
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--ink-muted)]/40 bg-white py-3.5 pl-12 pr-4 text-[var(--ink)] placeholder:text-[var(--ink-muted)] transition-colors focus:border-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink)] focus:ring-offset-2 focus:ring-offset-[var(--paper)]"
        />
      </div>
    </div>
  );
}

/** Single-select status chips (`aria-pressed`), with live counts so the row scales. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; count: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.id)}
            className={toggleClasses(
              isActive,
              "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
            )}
          >
            <span>{option.label}</span>
            <span
              className={`rounded-full px-2 text-xs ${
                isActive
                  ? "bg-[var(--paper)]/20 text-[var(--paper)]"
                  : "bg-[var(--paper-deep)] text-[var(--ink-muted)]"
              }`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ResultCount({
  shown,
  isFiltered,
  noun = "file",
}: {
  shown: number;
  isFiltered: boolean;
  noun?: string;
}) {
  return (
    <p aria-live="polite" aria-atomic="true" className="text-sm font-medium text-[var(--ink-muted)]">
      {shown === 0
        ? `No ${noun}s match your search.`
        : `${shown} ${shown === 1 ? noun : `${noun}s`} shown${isFiltered ? " for your search" : ""}.`}
    </p>
  );
}

/**
 * Resources card anatomy: icon box + pills, bold title, muted description, body, footer.
 * Optional `leading` (e.g. Admin select control) sits before the icon; `selected` rings
 * the card in ink.
 */
export function ResourceCard({
  slug,
  pills,
  title,
  description,
  children,
  footer,
  leading,
  selected = false,
}: {
  slug: string;
  pills: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  footer: ReactNode;
  leading?: ReactNode;
  selected?: boolean;
}) {
  return (
    <li
      className={`flex flex-col rounded-2xl border bg-white p-6 transition-shadow duration-300 hover:shadow-lg ${
        selected
          ? "border-[var(--ink)] ring-2 ring-[var(--ink)]"
          : "border-[var(--ink-muted)]/20"
      }`}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex shrink-0 items-center gap-3">
          {leading}
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] text-[var(--ink)]">
            <LibraryIcon slug={slug} />
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">{pills}</div>
      </div>

      <h2 className="mb-2 text-lg font-bold text-[var(--ink)]">{title}</h2>
      <p className="mb-6 flex-1 text-sm leading-relaxed text-[var(--ink-muted)]">
        {description}
      </p>

      {children}

      <div className="border-t border-[var(--ink-muted)]/20 pt-4">{footer}</div>
    </li>
  );
}

export function NoMatch({
  query,
  filterLabel,
  onClear,
  extraAction,
}: {
  query: string;
  /** Active status chip, or null when showing all. */
  filterLabel: string | null;
  onClear: () => void;
  extraAction?: ReactNode;
}) {
  const q = query.trim();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--ink-muted)]/20 bg-white px-6 py-12 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--paper-deep)] text-[var(--ink-muted)]">
        <Search size={32} aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-bold text-[var(--ink)]">Nothing here matches yet</h2>
      <p className="mb-8 max-w-md leading-relaxed text-[var(--ink-muted)]">
        {q ? <>Nothing matches &ldquo;{q}&rdquo;</> : <>Nothing matches</>}
        {filterLabel ? (
          <>
            {" "}under <span className="font-semibold text-[var(--ink)]">{filterLabel}</span>
          </>
        ) : null}
        . Clear what you have set to see every file again.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <button
          type="button"
          onClick={onClear}
          disabled={!q && !filterLabel}
          className={OUTLINE_BUTTON}
        >
          Clear search and filters
        </button>
        {extraAction}
      </div>
    </div>
  );
}
