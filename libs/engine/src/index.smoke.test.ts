import { describe, expect, it } from "vitest";
import { InvalidUrlError } from "./index";

describe("engine workspace smoke test", () => {
  it("resolves and executes a real export from libs/engine", () => {
    expect(new InvalidUrlError("x")).toBeInstanceOf(Error);
  });
});
