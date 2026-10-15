"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, readTheme, THEME_MODES, type ThemeMode } from "@/lib/theme";

const ICONS = { auto: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    setMode(readTheme());
  }, []);

  const choose = (m: ThemeMode) => {
    setMode(m);
    applyTheme(m);
  };

  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="radiogroup" aria-label="Theme">
      {THEME_MODES.map((m) => {
        const Icon = ICONS[m.value];
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={m.hint}
            onClick={() => choose(m.value)}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${active ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
