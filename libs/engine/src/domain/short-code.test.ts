import { describe, expect, it } from "vitest";
import { ShortCode } from "./short-code";

describe("ShortCode", () => {
  it("accepts a valid base62 value", () => {
    const code = ShortCode.create("AbC1234");

    expect(code.value).toBe("AbC1234");
  });

  it("rejects an empty string", () => {
    expect(() => ShortCode.create("")).toThrow();
  });

  it("rejects a value containing non-base62 characters", () => {
    expect(() => ShortCode.create("abc-123")).toThrow();
    expect(() => ShortCode.create("abc_123")).toThrow();
    expect(() => ShortCode.create("abc 123")).toThrow();
  });
});
