import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
} from "./theme";

// `resolveInitialTheme` is the single source of truth for the no-FOUC
// decision made both by the nonce'd inline script in `root.tsx` (via
// `themeInitScript()`, which serializes this exact function) and by
// `ThemeToggle`'s lazy initializer. Testing it here in isolation covers
// both call sites and guarantees they can never desync.
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
// confirm the generated script actually applies the "dark" class exactly
// like `resolveInitialTheme()` decides — the two can't desync because the
// script is generated from the same source function.
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
