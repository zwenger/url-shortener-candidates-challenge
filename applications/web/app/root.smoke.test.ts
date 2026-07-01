import { generateShortCode } from "@url-shortener/engine";
import { describe, expect, it } from "vitest";

describe("web workspace smoke test", () => {
  it("resolves the @url-shortener/engine workspace alias independently of vite.config.ts", () => {
    expect(typeof generateShortCode).toBe("function");
  });
});
