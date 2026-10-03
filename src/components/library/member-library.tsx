"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  Compass,
  Download,
  Globe,
  Lock,
  PlaneLanding,
  Rocket,
  Sprout,
  Store,
  type LucideIcon,
} from "lucide-react";
import {
  FilterChips,
  LIBRARY_PERSONAS,
  LibraryBrowseLayout,
  LibrarySearch,
  NoMatch,
  PersonaTabs,
  PILL_NEUTRAL,
  PILL_ON,
  ResourceCard,
  ResourceCtaLink,
  ResultCount,
  STATUS_TEXT,
  StageSidebar,
  TEXT_LINK,
  type LibraryPersonaId,
} from "@ifn/ui";
import { matchesLibraryQuery } from "@/lib/library-filter";

export type MemberLibraryItem = {
  slug: string;
  title: string;
  description: string;
  tag: string;
  /** Entitled AND Member download on. Computed on the server. */
  canDownload: boolean;
  /** From `library-placement`; items without one are not listed under any stage. */
  personaId?: LibraryPersonaId;
  stageId?: string;
};

type MemberFilter = "all" | "ready" | "unavailable";

const MEMBER_FILTERS: Array<{ id: MemberFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready to download" },
  { id: "unavailable", label: "Not available yet" },
];

/** Same icons as landing Resources. */
export const PERSONA_ICONS: Record<string, LucideIcon> = {
  aspiring: Sprout,
  startups: Rocket,
  smbs: Store,
  global: PlaneLanding,
  global_expansion: Globe,
};

export const PERSONA_OPTIONS = LIBRARY_PERSONAS.map((persona) => {
  const Icon = PERSONA_ICONS[persona.id] ?? Compass;
  return {
    id: persona.id as LibraryPersonaId,
    label: persona.name,
    icon: <Icon size={18} aria-hidden="true" className="shrink-0" />,
  };
});

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
  const [personaId, setPersonaId] = useState<LibraryPersonaId>(LIBRARY_PERSONAS[0].id);
  const [stageId, setStageId] = useState<string>(LIBRARY_PERSONAS[0].stages[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");

  const persona = LIBRARY_PERSONAS.find((p) => p.id === personaId) ?? LIBRARY_PERSONAS[0];
  const stage = persona.stages.find((s) => s.id === stageId) ?? persona.stages[0];
  const PersonaIcon = PERSONA_ICONS[persona.id] ?? Compass;

  // Search runs inside the chosen persona and stage, like landing.
  const searched = useMemo(
    () =>
      items.filter(
        (item) =>
          item.personaId === persona.id &&
          item.stageId === stage.id &&
          matchesLibraryQuery(item, searchQuery),
      ),
    [items, persona.id, stage.id, searchQuery],
  );
  const visible = searched.filter((item) => matchesMemberFilter(item, filter));
  const options = MEMBER_FILTERS.map((option) => ({
    ...option,
    count: searched.filter((item) => matchesMemberFilter(item, option.id)).length,
  }));
  const filterLabel =
    filter === "all" ? null : MEMBER_FILTERS.find((f) => f.id === filter)!.label;
  const isFiltered = searchQuery.trim().length > 0 || filter !== "all";

  const handlePersonaChange = (id: LibraryPersonaId) => {
    const next = LIBRARY_PERSONAS.find((p) => p.id === id) ?? LIBRARY_PERSONAS[0];
    setPersonaId(next.id);
    setStageId(next.stages[0].id);
    setSearchQuery("");
  };

  return (
    <LibraryBrowseLayout
      personas={
        <>
          <PersonaTabs options={PERSONA_OPTIONS} value={persona.id} onChange={handlePersonaChange} />
          <div className="mx-auto w-full max-w-xl">
            <LibrarySearch
              id="library-search"
              label={`Search guides for ${persona.name}`}
              placeholder={`Search ${persona.name} guides`}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
        </>
      }
      sidebar={<StageSidebar stages={persona.stages} value={stage.id} onChange={setStageId} />}
    >
      <div className="mb-8 space-y-3">
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--ink-muted)]/20 bg-[var(--paper-deep)] px-3 py-1 text-xs font-bold uppercase tracking-wide">
          <PersonaIcon size={14} aria-hidden="true" />
          {persona.name}
        </p>
        <h2 className="text-2xl font-bold tracking-tight">{stage.name}</h2>
        <p className="max-w-md text-[var(--ink-muted)]">{stage.description}</p>
        <ResultCount shown={visible.length} isFiltered={isFiltered} noun="guide" />
        {entitled ? (
          <div className="pt-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--ink-muted)]">
              Availability
            </p>
            <FilterChips
              label="Filter by availability"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <NoMatch
          query={searchQuery}
          filterLabel={filterLabel}
          noun="guide"
          titleAs="h3"
          description={
            isFiltered ? undefined : <>No guides for {stage.name} yet. Try another stage.</>
          }
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
        // Columns follow the card area beside the stage sidebar, not the viewport.
        <div className="@container">
          <ul className="grid list-none grid-cols-1 gap-6 p-0 @md:grid-cols-2 @2xl:grid-cols-3">
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
                memberCta={
                  entitled && item.canDownload ? (
                    <ResourceCtaLink
                      href={`/api/library/${item.slug}/download`}
                      icon={<Download size={16} aria-hidden="true" />}
                    >
                      Download PDF
                    </ResourceCtaLink>
                  ) : null
                }
                footer={
                  !entitled ? (
                    <p className={STATUS_TEXT}>
                      <Lock size={16} aria-hidden="true" />
                      Available after membership is linked.
                    </p>
                  ) : !item.canDownload ? (
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
                  ) : null
                }
              />
            ))}
          </ul>
        </div>
      )}
    </LibraryBrowseLayout>
  );
}
