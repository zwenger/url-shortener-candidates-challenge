import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("reconciles the icon/label to the current dark theme after mount", () => {
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it("toggles from the live DOM class, not stale React state (first click works after hydration)", async () => {
    // Reproduces the post-SSR-hydration desync: React state initializes to the
    // SSR default (light) while the no-FOUC script has already set <html> to
    // dark. Reading state instead of the DOM would make this first click a
    // no-op (re-applying dark); reading the DOM must switch to light.
    const user = userEvent.setup();
    render(<ThemeToggle />);
    document.documentElement.classList.add("dark");

    await user.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("adds the dark class and persists localStorage when toggled from light to dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: /switch to dark theme/i }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it("removes the dark class and persists localStorage when toggled from dark to light", async () => {
    document.documentElement.classList.add("dark");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: /switch to light theme/i }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(
      screen.getByRole("button", { name: /switch to dark theme/i }),
    ).toBeInTheDocument();
  });

  it("still toggles the DOM class and React state when localStorage.setItem throws", async () => {
    vi.spyOn(
      Object.getPrototypeOf(window.localStorage),
      "setItem",
    ).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await expect(
      user.click(screen.getByRole("button", { name: /switch to dark theme/i })),
    ).resolves.not.toThrow();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });
});
