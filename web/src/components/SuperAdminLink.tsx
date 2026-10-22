"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSuperAdmin } from "@/lib/api";

/** Shown only to super admins (the API decides; everyone else gets nothing). */
export function SuperAdminLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    void isSuperAdmin().then(setShow);
  }, []);
  if (!show) return null;
  return (
    <Link
      href="/x-dashboard"
      className="text-sm font-medium text-primary hover:underline"
    >
      Open the super-admin dashboard
    </Link>
  );
}
