import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
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
 * Client toggle for the light/dark theme. Mirrors the contract of the nonce'd
 * no-FOUC script in `root.tsx`: same `localStorage.theme` key ("dark" |
 * "light") and the same `dark` class on `<html>`.
 *
 * SSR can't know the client's stored/system theme, so the button renders with
 * an SSR-stable default (`false` → "switch to dark") on both the server and
 * the first client (hydration) render — identical markup, no hydration
 * mismatch. A mount effect then reconciles the icon/label to the real theme
 * the no-FOUC script already applied to `<html>`.
 *
 * Crucially, `toggleTheme` computes the next theme from the LIVE `<html>`
 * class, not from React state: after hydration the state lags the DOM (the
 * DOM is already dark, state is still the SSR `false`), so reading state would
 * make the first click a no-op (it would re-apply the current theme). Reading
 * the DOM makes the first click correct regardless of state timing.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(readDomTheme());
  }, []);

  function toggleTheme() {
    const next = !readDomTheme();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage-restricted contexts (e.g. Safari private browsing) throw on
      // setItem. The DOM class above already applied, so the theme still
      // switches for this session — it just won't persist across reloads.
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
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}
