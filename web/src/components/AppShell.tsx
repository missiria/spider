"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe2, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { writeToken } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Globe2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const SIDEBAR_KEY = "spider-sidebar";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open");
      } catch {
        /* per-browser convenience only */
      }
      return next;
    });
  };

  const logout = () => {
    writeToken(null);
    router.push("/login");
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ${collapsed ? "w-14" : "w-56"}`}
        aria-label="Sidebar"
      >
        <div className={`flex h-14 items-center border-b border-border ${collapsed ? "justify-center" : "justify-between px-4"}`}>
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
              Spider
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Open sidebar" : "Close sidebar"}
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <ToggleIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <nav className={`flex flex-1 flex-col gap-1 text-sm ${collapsed ? "items-center p-2" : "p-3"}`} aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-md transition-colors ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
                  active ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && label}
                {collapsed && <span className="sr-only">{label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className={`border-t border-border ${collapsed ? "flex justify-center p-2" : "p-3"}`}>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-3 rounded-md text-sm text-muted hover:bg-surface-muted hover:text-foreground ${collapsed ? "justify-center p-2" : "w-full px-3 py-2"}`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed && "Sign out"}
            {collapsed && <span className="sr-only">Sign out</span>}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</main>
    </div>
  );
}
