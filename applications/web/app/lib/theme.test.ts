import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveInitialTheme,
  resolveInitialThemeBody,
  THEME_STORAGE_KEY,
  themeInitScript,
} from "./theme";

// `resolveInitialTheme` is the runtime decision used by `ThemeToggle`'s lazy
// initializer. The no-FOUC inline script uses a separate hand-written copy
// (`resolveInitialThemeBody`); the "theme decision drift guard" below proves
// the two agree. Testing this function here covers the runtime call site.
describe("resolveInitialTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('returns true when localStorage theme is "dark"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    expect(resolveInitialTheme()).toBe(true);
  });

  it('returns false when localStorage theme is "light"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    expect(resolveInitialTheme()).toBe(false);
  });

  it("falls back to matchMedia when localStorage has no theme (prefers dark)", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(resolveInitialTheme()).toBe(true);
  });

  it("falls back to matchMedia when localStorage has no theme (prefers light)", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    expect(resolveInitialTheme()).toBe(false);
  });

  it("defaults to false and does not throw when localStorage.getItem throws", () => {
    vi.spyOn(
      Object.getPrototypeOf(window.localStorage),
      "getItem",
    ).mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });

    expect(() => resolveInitialTheme()).not.toThrow();
    expect(resolveInitialTheme()).toBe(false);
  });
});

// `themeInitScript()` is the literal string injected as a nonce'd inline
// `<script>` in `root.tsx`'s `<head>` (see comment there for why it must be
// a raw string, not a module import). These tests `eval` it directly to
// confirm the generated script actually applies the "dark" class the way the
// theme rule decides. Equivalence with `resolveInitialTheme` is proven
// separately by the "theme decision drift guard" below.
describe("themeInitScript", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it('adds the "dark" class when localStorage theme is "dark"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    // biome-ignore lint/security/noGlobalEval: intentional test of the exact string used in production (see comment above).
    eval(themeInitScript());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it('does not add the "dark" class when localStorage theme is "light"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    // biome-ignore lint/security/noGlobalEval: intentional test of the exact string used in production (see comment above).
    eval(themeInitScript());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does not throw when localStorage.getItem throws inside the script", () => {
    vi.spyOn(
      Object.getPrototypeOf(window.localStorage),
      "getItem",
    ).mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });

    // biome-ignore lint/security/noGlobalEval: intentional test of the exact string used in production (see comment above).
    expect(() => eval(themeInitScript())).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// Drift guard: `resolveInitialThemeBody` (the hand-written string embedded in
// the inline `<head>` script) and `resolveInitialTheme` (the module function)
// are TWO independent representations of the same decision. Nothing generates
// one from the other, so a change to one that isn't mirrored in the other
// would silently desync FOUC-prevention from the runtime toggle. This test
// drives BOTH across the same input matrix and fails if they ever disagree.
describe("theme decision drift guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  // Evaluates the inline-script's `resolveInitialTheme` in isolation (without
  // the DOM-mutation tail of `themeInitScript`) and returns its boolean.
  function scriptDecision(): boolean {
    // biome-ignore lint/security/noGlobalEval: intentional test of the exact string used in production (see comment above).
    return eval(
      `(function(){${resolveInitialThemeBody()}return resolveInitialTheme();})()`,
    );
  }

  const cases: Array<{
    name: string;
    stored: "dark" | "light" | null;
    prefersDark: boolean;
  }> = [
    { name: "stored dark, OS light", stored: "dark", prefersDark: false },
    { name: "stored dark, OS dark", stored: "dark", prefersDark: true },
    { name: "stored light, OS dark", stored: "light", prefersDark: true },
    { name: "stored light, OS light", stored: "light", prefersDark: false },
    { name: "no stored value, OS dark", stored: null, prefersDark: true },
    { name: "no stored value, OS light", stored: null, prefersDark: false },
  ];

  it.each(cases)(
    "the inline script agrees with resolveInitialTheme: $name",
    ({ stored, prefersDark }) => {
      if (stored) {
        window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      }
      window.matchMedia = vi.fn().mockReturnValue({ matches: prefersDark });

      const moduleDecision = resolveInitialTheme();

      expect(scriptDecision()).toBe(moduleDecision);
    },
  );
});
