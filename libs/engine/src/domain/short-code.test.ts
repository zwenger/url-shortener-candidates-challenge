import { describe, expect, it } from "vitest";
import { InvalidShortCodeError } from "./errors";
import { ShortCode } from "./short-code";

describe("ShortCode", () => {
  it("accepts a valid base62 value", () => {
    const code = ShortCode.create("AbC1234");

    expect(code.value).toBe("AbC1234");
  });

  it("rejects an empty string with InvalidShortCodeError", () => {
    expect(() => ShortCode.create("")).toThrow(InvalidShortCodeError);
  });

  it("rejects a value containing non-base62 characters with InvalidShortCodeError", () => {
    expect(() => ShortCode.create("abc-123")).toThrow(InvalidShortCodeError);
    expect(() => ShortCode.create("abc_123")).toThrow(InvalidShortCodeError);
    expect(() => ShortCode.create("abc 123")).toThrow(InvalidShortCodeError);
  });
});
