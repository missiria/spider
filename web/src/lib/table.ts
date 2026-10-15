import type { PropertyKpi, PropertyStatus } from "./types";

export type SortKey =
  | "display_name"
  | "clicks"
  | "clicks_delta"
  | "impressions"
  | "impressions_delta"
  | "ctr"
  | "position"
  | "position_delta"
  | "data_since"
  | "status";

export type SortDir = "asc" | "desc";

export interface TableState {
  sortKey: SortKey;
  sortDir: SortDir;
  search: string;
  status: PropertyStatus | "all";
  hideEmpty: boolean;
}

export const DEFAULT_TABLE_STATE: TableState = {
  sortKey: "clicks",
  sortDir: "desc",
  search: "",
  status: "all",
  hideEmpty: false,
};

/** Numeric columns default to descending (biggest first), text columns to ascending. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  display_name: "asc",
  clicks: "desc",
  clicks_delta: "desc",
  impressions: "desc",
  impressions_delta: "desc",
  ctr: "desc",
  position: "asc", // lower position is better
  position_delta: "asc",
  data_since: "asc",
  status: "asc",
};

export function sortValue(row: PropertyKpi, key: SortKey): number | string | null {
  switch (key) {
    case "display_name":
      return row.display_name.toLowerCase();
    case "clicks":
      return row.current.clicks;
    case "clicks_delta":
      return row.delta.clicks;
    case "impressions":
      return row.current.impressions;
    case "impressions_delta":
      return row.delta.impressions;
    case "ctr":
      return row.current.ctr;
    case "position":
      return row.current.position || null; // 0 = no data → treat as missing
    case "position_delta":
      return row.delta.position;
    case "data_since":
      return row.data_since;
    case "status":
      return row.status;
  }
}

/** Nulls always sort last whatever the direction. */
export function compareRows(a: PropertyKpi, b: PropertyKpi, key: SortKey, dir: SortDir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  let cmp: number;
  if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
  else cmp = String(va).localeCompare(String(vb));
  return dir === "asc" ? cmp : -cmp;
}

export function toggleSort(state: TableState, key: SortKey): TableState {
  if (state.sortKey === key) {
    return { ...state, sortDir: state.sortDir === "asc" ? "desc" : "asc" };
  }
  return { ...state, sortKey: key, sortDir: DEFAULT_DIR[key] };
}

export function applyTableState(rows: PropertyKpi[], state: TableState): PropertyKpi[] {
  const q = state.search.trim().toLowerCase();
  return rows
    .filter((r) => (q ? r.display_name.toLowerCase().includes(q) || r.site_url.toLowerCase().includes(q) : true))
    .filter((r) => (state.status === "all" ? true : r.status === state.status))
    .filter((r) => (state.hideEmpty ? r.current.clicks > 0 || r.current.impressions > 0 : true))
    .sort((a, b) => compareRows(a, b, state.sortKey, state.sortDir));
}
