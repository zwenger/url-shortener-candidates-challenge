export const THEME_STORAGE_KEY = "theme";

/**
 * Decides whether the "dark" theme should be active on first paint:
 * `localStorage.theme` ("dark" | "light") wins if present, otherwise falls
 * back to the OS preference via `matchMedia`. Wrapped in try/catch because
 * `localStorage` access can throw (e.g. Safari private browsing, storage
 * disabled by policy) — in that case we fail safe to `false` (light) rather
 * than let the caller crash.
 *
 * This is the runtime decision function, called by `ThemeToggle`'s lazy
 * `useState` initializer. The no-FOUC inline `<head>` script uses a SEPARATE
 * hand-written copy of this rule (`resolveInitialThemeBody()`), NOT a
 * serialization of this function — the two are kept in sync manually and
 * guarded by the drift-guard test in `theme.test.ts`.
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
 * Serializes the initial-theme decision + the DOM-mutation it drives into a
 * standalone IIFE string, for use as a nonce'd inline `<script>` in
 * `root.tsx`'s `<head>` (must run synchronously before first paint — a
 * `useEffect` runs after hydration, which is too late to prevent the flash).
 *
 * IMPORTANT: the decision logic here comes from `resolveInitialThemeBody()`,
 * which is a SEPARATE, hand-written string — it is NOT generated from
 * `resolveInitialTheme` above. The two are independent representations of the
 * same rule and CAN drift apart if only one is edited. They are kept in sync
 * manually and guarded by the "theme decision drift guard" test in
 * `theme.test.ts`, which drives both across the same input matrix and fails
 * if they ever disagree. Do not rewrite this mechanism without updating that
 * test (this module has a history of SSR fragility).
 */
export function themeInitScript(): string {
  return `(function(){try{${resolveInitialThemeBody()}var d=resolveInitialTheme();document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
}

// Hand-written source for the inline script: declares a local
// `resolveInitialTheme` function inside the generated script so it has no
// runtime dependency on this module (the script executes as a raw string in
// the browser, before any bundle loads). This must stay behaviorally
// equivalent to `resolveInitialTheme` above — the drift-guard test enforces
// that. Exported solely so that test can evaluate it in isolation.
export function resolveInitialThemeBody(): string {
  return `function resolveInitialTheme(){var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t){return t==="dark";}return window.matchMedia("(prefers-color-scheme: dark)").matches;}`;
}
