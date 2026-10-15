export type ThemeMode = "auto" | "light" | "dark";

export const THEME_KEY = "spider-theme";
export const THEME_MODES: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Follow the system" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

export function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Sets data-theme on <html>: "light" | "dark", or removes it for auto (CSS media query decides). */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* storage unavailable: attribute still applied for this page */
  }
}

/** Inline, runs before paint so there is no light flash on dark mode. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
