"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { themeStorageKey } from "./lib/theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      const savedDark = localStorage.getItem(themeStorageKey) === "dark";
      setDark(savedDark);
      document.documentElement.dataset.theme = savedDark ? "dark" : "light";
    } catch {
      // The toggle still works when the browser blocks storage.
    }
  }, []);

  function toggleTheme() {
    const nextTheme = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Keep the current page's theme even without storage.
    }
  }

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label="Темна тема"
      aria-pressed={dark}
      title={dark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
      onClick={toggleTheme}
    >
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
