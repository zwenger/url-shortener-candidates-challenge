import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts does not enable `test.globals`, so @testing-library/react's
// auto-cleanup (which relies on a global `afterEach`) never registers.
// Without this, each render leaks its DOM into the next test in the same file.
afterEach(() => {
  cleanup();
});
