export const THEME_STORAGE_KEY = "theme";

/**
 * Decides whether the "dark" theme should be active on first paint:
 * `localStorage.theme` ("dark" | "light") wins if present, otherwise falls
 * back to the OS preference via `matchMedia`. Wrapped in try/catch because
 * `localStorage` access can throw (e.g. Safari private browsing, storage
 * disabled by policy) — in that case we fail safe to `false` (light) rather
 * than let the caller crash.
 *
 * This is the SINGLE source of truth for the initial-theme decision. Both
 * the nonce'd no-FOUC inline script in `root.tsx` (via `themeInitScript()`,
 * which serializes this exact function into a string) and `ThemeToggle`'s
 * lazy `useState` initializer call it, so the two call sites can never
 * desync.
 */
export function resolveInitialTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      return stored === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * Serializes `resolveInitialTheme` + the DOM-mutation it drives into a
 * standalone IIFE string, for use as a nonce'd inline `<script>` in
 * `root.tsx`'s `<head>` (must run synchronously before first paint — a
 * `useEffect` runs after hydration, which is too late to prevent the
 * flash). Built from the same function body as the testable version above,
 * so the two can't drift apart.
 */
export function themeInitScript(): string {
  return `(function(){try{${resolveInitialThemeBody()}var d=resolveInitialTheme();document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
}

// Inlined body reused by `themeInitScript()`: declares a local
// `resolveInitialTheme` function inside the generated script so it has no
// runtime dependency on this module (the script executes as a raw string
// in the browser, before any bundle loads).
function resolveInitialThemeBody(): string {
  return `function resolveInitialTheme(){var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t){return t==="dark";}return window.matchMedia("(prefers-color-scheme: dark)").matches;}`;
}
