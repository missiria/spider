import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { API_URL } from "@/lib/authProxy";
import { SESSION_COOKIE } from "@/lib/session";
import { EmailBrandEditor } from "@/components/EmailBrandEditor";

export default async function EmailBrandPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const response = await fetch(`${API_URL}/admin/email-brand`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login");
  if (response.status === 403) notFound();
  if (!response.ok) throw new Error("Unable to verify admin access");
  return <EmailBrandEditor />;
}
