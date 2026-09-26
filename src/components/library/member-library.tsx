"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Clock, Download, Lock } from "lucide-react";
import {
  FilterChips,
  LibrarySearch,
  NoMatch,
  PILL_NEUTRAL,
  PILL_ON,
  ResourceCard,
  ResultCount,
  TEXT_LINK,
} from "@/components/library/resource-ui";
import { matchesLibraryQuery } from "@/lib/library-filter";

export type MemberLibraryItem = {
  slug: string;
  title: string;
  description: string;
  tag: string;
  /** Entitled AND Member download on. Computed on the server. */
  canDownload: boolean;
};

type MemberFilter = "all" | "ready" | "unavailable";

const MEMBER_FILTERS: Array<{ id: MemberFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready to download" },
  { id: "unavailable", label: "Not available yet" },
];

function matchesMemberFilter(item: MemberLibraryItem, filter: MemberFilter): boolean {
  if (filter === "ready") return item.canDownload;
  if (filter === "unavailable") return !item.canDownload;
  return true;
}

export function MemberLibrary({
  items,
  entitled,
}: {
  items: MemberLibraryItem[];
  entitled: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");

  const searched = useMemo(
    () => items.filter((item) => matchesLibraryQuery(item, searchQuery)),
    [items, searchQuery],
  );
  const visible = searched.filter((item) => matchesMemberFilter(item, filter));
  const options = MEMBER_FILTERS.map((option) => ({
    ...option,
    count: searched.filter((item) => matchesMemberFilter(item, option.id)).length,
  }));
  const filterLabel =
    filter === "all" ? null : MEMBER_FILTERS.find((f) => f.id === filter)!.label;
  const isFiltered = searchQuery.trim().length > 0 || filter !== "all";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <LibrarySearch
          id="library-search"
          label="Search the library"
          placeholder="Search Pack A guides"
          value={searchQuery}
          onChange={setSearchQuery}
        />
        {entitled ? (
          <FilterChips
            label="Filter by availability"
            options={options}
            value={filter}
            onChange={setFilter}
          />
        ) : null}
        <ResultCount shown={visible.length} isFiltered={isFiltered} noun="guide" />
      </div>

      {visible.length === 0 ? (
        <NoMatch
          query={searchQuery}
          filterLabel={filterLabel}
          onClear={() => {
            setSearchQuery("");
            setFilter("all");
          }}
          extraAction={
            <a href="mailto:hello@ifn.community" className={TEXT_LINK}>
              Tell us what you need
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          }
        />
      ) : (
        <ul className="grid list-none gap-6 p-0 md:grid-cols-2">
          {visible.map((item) => (
            <ResourceCard
              key={item.slug}
              slug={item.slug}
              title={item.title}
              description={item.description}
              pills={
                <>
                  <span className={PILL_NEUTRAL}>{item.tag}</span>
                  {item.canDownload ? (
                    <span className={PILL_ON}>
                      <Download size={12} aria-hidden="true" />
                      Ready
                    </span>
                  ) : null}
                </>
              }
              footer={
                !entitled ? (
                  <p className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ink-muted)]">
                    <Lock size={16} aria-hidden="true" />
                    Available after membership is linked.
                  </p>
                ) : item.canDownload ? (
                  <a href={`/api/library/${item.slug}/download`} className={TEXT_LINK}>
                    Download PDF
                    <Download size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <div>
                    <p
                      aria-disabled="true"
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--ink-muted)]"
                    >
                      <Clock size={16} aria-hidden="true" />
                      Download unavailable
                    </p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      This file is not enabled for download yet.
                    </p>
                  </div>
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
