import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trust-proxy.server";

describe("parseTrustProxy", () => {
  it("defaults to false (no trust) when unset", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it("defaults to false (no trust) for an empty string", () => {
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("   ")).toBe(false);
  });

  it("parses an integer hop count as a number, not a boolean", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("never returns a bare boolean true even if the raw value looks truthy", () => {
    const result = parseTrustProxy("true");
    expect(result).not.toBe(true);
    expect(typeof result === "number" ? false : result).toBe("true");
  });

  it("passes through a comma-separated IP/CIDR list", () => {
    expect(parseTrustProxy("10.0.0.1,192.168.1.0/24")).toBe(
      "10.0.0.1,192.168.1.0/24",
    );
  });

  it("passes through a single CIDR range", () => {
    expect(parseTrustProxy("172.16.0.0/12")).toBe("172.16.0.0/12");
  });
});
