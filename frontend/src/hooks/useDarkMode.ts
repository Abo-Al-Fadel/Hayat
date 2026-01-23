// src/hooks/useDarkMode.ts
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "darkMode";

export function useDarkMode(defaultValue = false) {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === "true" : defaultValue;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, String(darkMode));
  }, [darkMode]);

  const toggle = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  return { darkMode, setDarkMode, toggle };
}
