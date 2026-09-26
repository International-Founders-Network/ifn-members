import type { LibraryAssetFlags } from "@/lib/library-flags";

/** Case-insensitive match on title, slug and description (Resources search). */
export function matchesLibraryQuery(
  item: { slug: string; title: string; description: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.slug.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q)
  );
}

export type AdminStatusFilter = "all" | "member" | "teaser" | "landingFull" | "off";

export const ADMIN_STATUS_FILTERS: Array<{ id: AdminStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "member", label: "Member download on" },
  { id: "teaser", label: "Public teaser on" },
  { id: "landingFull", label: "Landing full on" },
  { id: "off", label: "All off" },
];

export function matchesAdminStatus(
  flags: LibraryAssetFlags,
  filter: AdminStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "member":
      return flags.downloadable;
    case "teaser":
      return flags.teaserPublic;
    case "landingFull":
      return flags.landingFull;
    case "off":
      return !flags.downloadable && !flags.teaserPublic && !flags.landingFull;
  }
}
