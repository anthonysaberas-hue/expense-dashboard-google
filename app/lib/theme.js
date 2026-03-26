import { safeGet, safeSet } from "./storage";

const KEY = "theme_preference";

export function getTheme() {
  return safeGet(KEY, "system");
}

export function applyTheme(theme) {
  safeSet(KEY, theme);
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}
