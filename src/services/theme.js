export const THEME_STORAGE_KEY = "world-food-lens-theme";

export function resolveTheme(savedTheme, prefersDark = false) {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return prefersDark ? "dark" : "light";
}

export function nextTheme(theme) {
  return theme === "dark" ? "light" : "dark";
}
