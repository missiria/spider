import axios, { AxiosError } from "axios";
import type {
  AuthResponse,
  FleetOverview,
  FleetSeries,
  KeyFilters,
  Opportunity,
  OpportunityDetail,
  OpportunityList,
  PropertyDetail,
  RuleConfig,
  SavedView,
  ViewScope,
  PropertyListResponse,
  PropertyRow,
  Settings,
  User,
} from "./types";

/**
 * Login goes through the Next route /auth/session, which calls the API server-side and
 * stores the JWT in an httpOnly cookie. The token never reaches browser JavaScript.
 */
export async function startSession(email: string, password: string): Promise<AuthResponse["user"]> {
  const res = await fetch("/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; user?: AuthResponse["user"] };
  if (!res.ok) throw new Error(data.message ?? "Login failed");
  return data.user as AuthResponse["user"];
}

export async function endSession(): Promise<void> {
  await fetch("/auth/session", { method: "DELETE" }).catch(() => undefined);
}

// Same-origin: next.config rewrites /api/* to the NestJS API.
export const api = axios.create({ baseURL: "/api", timeout: 30_000 });

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        void endSession().then(() => {
          window.location.href = "/login";
        });
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export interface PeriodParams {
  start?: string;
  end?: string;
  days?: number;
}

export const getOverview = (p: PeriodParams) =>
  api.get<FleetOverview>("/overview", { params: p }).then((r) => r.data);

export const getSeries = (p: PeriodParams) =>
  api.get<FleetSeries>("/overview/series", { params: p }).then((r) => r.data);

export const getProperties = () =>
  api.get<PropertyListResponse>("/properties").then((r) => r.data);

export const createProperty = (siteUrl: string) =>
  api
    .post<{ property: PropertyRow; serviceAccountEmail: string }>("/properties", { siteUrl })
    .then((r) => r.data);

export const getProperty = (id: number, p: PeriodParams, filters: KeyFilters = {}) =>
  api
    .get<PropertyDetail>(`/properties/${id}`, { params: { ...p, ...compact(filters) } })
    .then((r) => r.data);

function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

export const listViews = (scope: ViewScope, propertyId?: number) =>
  api
    .get<{ items: SavedView[] }>("/views", { params: { scope, property_id: propertyId } })
    .then((r) => r.data);

export const createView = (body: { scope: ViewScope; property_id?: number; name: string; config: Record<string, unknown> }) =>
  api.post<SavedView>("/views", body).then((r) => r.data);

export const updateView = (id: number, body: { name?: string; config?: Record<string, unknown> }) =>
  api.patch<SavedView>(`/views/${id}`, body).then((r) => r.data);

export const deleteView = (id: number) => api.delete(`/views/${id}`);

export const checkProperty = (id: number) =>
  api
    .post<{ property: PropertyRow; justConnected: boolean }>(`/properties/${id}/check`)
    .then((r) => r.data);

export const resyncProperty = (id: number, kind?: "backfill") =>
  api
    .post<{ started: boolean; kind?: string; reason?: string }>(`/properties/${id}/sync`, null, { params: kind ? { kind } : undefined })
    .then((r) => r.data);

export const deleteProperty = (id: number) => api.delete(`/properties/${id}`);

export const getMe = () => api.get<User>("/auth/me").then((r) => r.data);

export const updateMe = (body: { name?: string; email?: string }) =>
  api.patch<User>("/auth/me", body).then((r) => r.data);

export const getSettings = () => api.get<Settings>("/settings").then((r) => r.data);

export interface OpportunityFilter {
  status?: string;
  property_id?: number;
  rule?: string;
  priority?: string;
  subject?: string;
  assignee_id?: number;
}

export const listOpportunities = (f: OpportunityFilter) =>
  api.get<OpportunityList>("/opportunities", { params: compact(f) }).then((r) => r.data);

export const getOpportunity = (id: number) => api.get<OpportunityDetail>(`/opportunities/${id}`).then((r) => r.data);

export const updateOpportunity = (
  id: number,
  body: { status?: Opportunity["status"]; priority?: Opportunity["priority"]; assignee_id?: number | null; due_date?: string | null; note?: string },
) => api.patch<OpportunityDetail>(`/opportunities/${id}`, body).then((r) => r.data);

export const scanOpportunities = () =>
  api.post<{ properties: number; created: number; updated: number; findings: number; skipped: number }>("/opportunities/scan").then((r) => r.data);

export const getRules = () => api.get<RuleConfig>("/opportunities/rules").then((r) => r.data);
export const putRules = (body: Partial<RuleConfig>) => api.put<RuleConfig>("/opportunities/rules", body).then((r) => r.data);

export const listUsers = () => api.get<{ items: User[] }>("/users").then((r) => r.data);

export const inviteUser = (body: { email: string; name: string; role?: "admin" | "member" }) =>
  api.post<{ user: User; temporary_password: string }>("/users", body).then((r) => r.data);

export const deactivateUser = (id: number) => api.delete(`/users/${id}`);

export interface SyncHealth {
  properties: {
    total: number;
    connected: number;
    pending: number;
    revoked: number;
    error: number;
    with_errors: { id: number; site_url: string; status: string; last_error: string }[];
    stale: { id: number; site_url: string; last_sync_at: string | null }[];
  };
  failed_runs: { id: number; property_id: number; kind: string; started_at: string; error: string | null }[];
  mock: boolean;
  ok: boolean;
}

export const getSyncHealth = () => api.get<SyncHealth>("/settings/health").then((r) => r.data);
