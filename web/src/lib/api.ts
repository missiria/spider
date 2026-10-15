import axios, { AxiosError } from "axios";
import type {
  AuthResponse,
  FleetOverview,
  FleetSeries,
  PropertyDetail,
  PropertyListResponse,
  PropertyRow,
  Settings,
  User,
} from "./types";

export const TOKEN_COOKIE = "token";

export function readToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeToken(token: string | null) {
  if (typeof document === "undefined") return;
  if (!token) {
    document.cookie = `${TOKEN_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    return;
  }
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Max-Age=86400; path=/; SameSite=Lax`;
}

// Same-origin: next.config rewrites /api/* to the NestJS API.
export const api = axios.create({ baseURL: "/api", timeout: 30_000 });

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      writeToken(null);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
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

export const login = (email: string, password: string) =>
  api.post<AuthResponse>("/auth/login", { email, password }).then((r) => r.data);

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

export const getProperty = (id: number, p: PeriodParams) =>
  api.get<PropertyDetail>(`/properties/${id}`, { params: p }).then((r) => r.data);

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
