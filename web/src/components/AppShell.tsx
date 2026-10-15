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
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
            Spider
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
                    active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="ml-auto flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
