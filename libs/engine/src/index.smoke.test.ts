import { describe, expect, it } from "vitest";
import { generateShortCode } from "./index";

describe("engine workspace smoke test", () => {
  it("resolves and executes a real export from libs/engine", () => {
    expect(typeof generateShortCode).toBe("function");
  });
});
