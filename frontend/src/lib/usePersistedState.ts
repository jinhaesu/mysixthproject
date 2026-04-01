"use client";
import { useState, useEffect } from "react";

/**
 * useState that persists to sessionStorage.
 * State survives page navigation but clears on tab/browser close.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `ps_${key}`;

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return defaultValue;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [state, storageKey]);

  return [state, setState];
}
