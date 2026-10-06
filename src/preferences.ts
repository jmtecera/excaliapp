import { createSignal } from "solid-js";

export type ThemePreference = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "excalidrawTheme";
const [themePreference, setThemePreferenceSignal] = createSignal<ThemePreference>(readTheme());

export { themePreference };

export function setThemePreference(nextTheme: ThemePreference): void {
  setThemePreferenceSignal(nextTheme);
  applyThemePreference(nextTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Storage may be unavailable (e.g. private browsing); the theme still applies for this session.
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = preference === "system" ? "light dark" : preference;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", preference === "light" ? "#fafaf9" : "#000000");
}

function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}
