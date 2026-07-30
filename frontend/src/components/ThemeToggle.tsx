"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  // The no-flash init script in layout.tsx already set this before hydration.
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Persistent light/dark theme toggle for the admin (aisystem) app.
 *
 * Reads/writes `document.documentElement.dataset.theme` (drives every
 * `var(--…)` design token in globals.css) and persists the choice to
 * `localStorage.theme` so it survives reloads/navigation across the whole
 * origin. Defaults to dark — never derives from `prefers-color-scheme`.
 *
 * Deliberately does NOT use `usePersistedState` (sessionStorage, tab-scoped)
 * since the theme needs to be a durable, cross-tab, pre-paint preference —
 * that's why the layout's inline script reads `localStorage` directly.
 */
export default function ThemeToggle() {
  // Start undefined-safe: render the dark icon by default on the server,
  // then sync to whatever the inline script already applied post-mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, etc) — theme just won't persist.
    }
  };

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      className="ring-focus flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[#d4d4d8] hover:text-white hover:bg-white/10 transition-colors"
    >
      {isLight ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  );
}
