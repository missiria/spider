import type { TopRow } from "./types";

export type TopSortKey = "key_text" | "clicks" | "impressions" | "ctr" | "position";
export type TopSortDir = "asc" | "desc";

export interface TopTableState {
  sortKey: TopSortKey;
  sortDir: TopSortDir;
  search: string;
  minClicks: number;
}

export const DEFAULT_TOP_STATE: TopTableState = { sortKey: "clicks", sortDir: "desc", search: "", minClicks: 0 };

const DEFAULT_DIR: Record<TopSortKey, TopSortDir> = {
  key_text: "asc",
  clicks: "desc",
  impressions: "desc",
  ctr: "desc",
  position: "asc",
};

export function toggleTopSort(state: TopTableState, key: TopSortKey): TopTableState {
  if (state.sortKey === key) return { ...state, sortDir: state.sortDir === "asc" ? "desc" : "asc" };
  return { ...state, sortKey: key, sortDir: DEFAULT_DIR[key] };
}

export function applyTopState(rows: TopRow[], state: TopTableState): TopRow[] {
  const q = state.search.trim().toLowerCase();
  const { sortKey, sortDir } = state;
  return rows
    .filter((r) => (q ? r.key_text.toLowerCase().includes(q) : true))
    .filter((r) => r.clicks >= state.minClicks)
    .sort((a, b) => {
      const cmp = sortKey === "key_text" ? a.key_text.localeCompare(b.key_text) : a[sortKey] - b[sortKey];
      // tie-break on clicks desc, then impressions desc, so ordering is stable and meaningful
      const tie = b.clicks - a.clicks || b.impressions - a.impressions;
      return (sortDir === "asc" ? cmp : -cmp) || tie;
    });
}
