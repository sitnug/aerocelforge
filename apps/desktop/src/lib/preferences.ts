export type AppTheme = "bright" | "cockpit";

export const DEFAULT_THEME: AppTheme = "bright";

export function readThemePreference(): AppTheme {
  return localStorage.getItem("aerocel.theme") === "cockpit" ? "cockpit" : DEFAULT_THEME;
}

export function readAdvancedPreference(): boolean {
  return localStorage.getItem("aerocel.advanced") === "true";
}
