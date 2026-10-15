"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { writeToken } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Globe2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    writeToken(null);
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">
        <Link href="/" className="flex h-14 items-center gap-2 border-b border-border px-4 font-semibold tracking-tight">
          <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
          Spider
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-3 text-sm" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                  active ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</main>
    </div>
  );
}
