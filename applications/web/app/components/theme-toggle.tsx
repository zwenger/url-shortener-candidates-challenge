import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { THEME_STORAGE_KEY } from "~/lib/theme";

// Reads the current "dark" class off `<html>` if a DOM exists, or `false`
// otherwise. `ThemeToggle` renders inside `/` and `/urls`, both full
// document (SSR) routes — `document` is undefined during the server
// render, so this must not assume a browser environment.
function readDomTheme(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

/**
 * Client-only toggle for the light/dark theme. Mirrors the contract of the
 * nonce'd no-FOUC script in `root.tsx`: same `localStorage.theme` key
 * ("dark" | "light") and the same `dark` class on `<html>`.
 *
 * The initial state is read synchronously from `document.documentElement`
 * via a lazy `useState` initializer, not `useState(null)` + a `useEffect`.
 * On the server (`typeof document === "undefined"`) this falls back to
 * `false`; on the client it reads the real value, which the nonce'd
 * no-FOUC script in `root.tsx` already applied to `<html>` before this
 * component mounts. When the two differ (e.g. dark mode active), React's
 * hydration reconciles the button's `aria-label`/icon to the client value
 * in the same commit — `suppressHydrationWarning` on the icon acknowledges
 * that intentional, expected mismatch instead of logging noise for it.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(readDomTheme);

  function toggleTheme() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Safari private browsing (and similar storage-restricted contexts)
      // throws on setItem. The DOM class above already applied, so the
      // theme still switches for this session — it just won't persist
      // across reloads. React state below must still update so it can't
      // desync from the DOM class we just set.
    }
    setIsDark(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      suppressHydrationWarning
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}
