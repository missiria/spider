"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Hide the global editor from tenant admins; the API/page also enforce access. */
export function EmailBrandLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let mounted = true;
    api
      .get("/admin/email-brand")
      .then(() => {
        if (mounted) setAllowed(true);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  return allowed ? (
    <Link
      href="/x-dashboard/email"
      className="mt-3 inline-flex text-sm font-medium text-primary"
    >
      Manage shared email branding →
    </Link>
  ) : null;
}
