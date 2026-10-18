"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Sign in / Create account switch; the indicator slides because the layout persists. */
export function AuthTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const next = params.get("next");
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const register = pathname.startsWith("/register");
  const tab =
    "relative z-10 flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors";
  return (
    <nav
      aria-label="Account"
      className="relative mb-8 flex rounded-lg bg-surface-muted p-1"
    >
      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-surface shadow-sm ring-1 ring-border transition-transform duration-300 ease-[cubic-bezier(.3,.7,.2,1)] ${
          register ? "translate-x-full" : "translate-x-0"
        }`}
      />
      <Link
        href={`/login${q}`}
        aria-current={!register ? "page" : undefined}
        className={`${tab} ${!register ? "text-foreground" : "text-muted hover:text-foreground"}`}
      >
        Sign in
      </Link>
      <Link
        href={`/register${q}`}
        aria-current={register ? "page" : undefined}
        className={`${tab} ${register ? "text-foreground" : "text-muted hover:text-foreground"}`}
      >
        Create account
      </Link>
    </nav>
  );
}
