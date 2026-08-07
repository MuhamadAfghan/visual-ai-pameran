import { useState } from "react";

/**
 * useState that persists to localStorage.
 * Falls back to defaultValue if the key is missing or the stored value can't be parsed.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  function set(val: T) {
    setValue(val);
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // quota exceeded or private-browsing restriction — state still updates in-memory
    }
  }

  return [value, set];
}
