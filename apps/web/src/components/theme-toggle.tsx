"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "signal-theme";
const changeEvent = "signal-theme-change";
type Theme = "light" | "dark";

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    const value = event.key === null ? null : event.newValue;
    document.documentElement.dataset.theme = value === "light" || value === "dark"
      ? value
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    onChange();
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  function toggle() {
    const value = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem(storageKey, value); } catch { /* The toggle still works when storage is unavailable. */ }
    window.dispatchEvent(new Event(changeEvent));
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    <span>{next === "dark" ? "Dark mode" : "Light mode"}</span>
  </button>;
}
