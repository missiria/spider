import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { API_URL } from "@/lib/authProxy";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Super-admin area (MISS-0124). Decided on the server before anything renders: no session →
 * login, a session that is not a super admin → 404 (the area does not advertise itself).
 * The API enforces the same rule on every /admin endpoint; this check only avoids shipping
 * the page to people who cannot use it.
 */
export default async function XDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login?next=/x-dashboard");
  const res = await fetch(`${API_URL}/admin/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login?next=/x-dashboard");
  if (!res.ok) notFound();
  return <AppShell>{children}</AppShell>;
}
