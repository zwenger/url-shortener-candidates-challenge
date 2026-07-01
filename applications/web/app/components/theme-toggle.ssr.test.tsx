// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

// `ThemeToggle` renders inside `/`'s and `/urls`'s SSR document response
// (both are full document routes with loaders), so it MUST tolerate a
// server render where `document`/`window`/`localStorage` don't exist. This
// is a real regression caught via a Docker run: an earlier lazy `useState`
// initializer read `document.documentElement` directly, crashing SSR with
// `ReferenceError: document is not defined`. Runs under vitest's `node`
// environment (no jsdom globals) to reproduce the exact conditions.
describe("ThemeToggle SSR safety", () => {
  it("does not throw when server-rendered (no document/window/localStorage)", () => {
    expect(() => renderToStaticMarkup(<ThemeToggle />)).not.toThrow();
  });
});
