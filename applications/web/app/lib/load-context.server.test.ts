import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIpFrom } from "./load-context.server";

describe("clientIpFrom", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns the client IP when present in the load context", () => {
    const result = clientIpFrom({ clientIp: "203.0.113.10" });

    expect(result).toEqual({ ip: "203.0.113.10", failOpen: false });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("fails open (does not fabricate a shared bucket key) when context has no clientIp", () => {
    const result = clientIpFrom({});

    expect(result.failOpen).toBe(true);
    expect(result.ip).toBeUndefined();
  });

  it("fails open and warns when context is undefined", () => {
    const result = clientIpFrom(undefined);

    expect(result.failOpen).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("fails open and warns when context is not an object", () => {
    const result = clientIpFrom("not-a-context");

    expect(result.failOpen).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("fails open and warns when clientIp is present but not a string", () => {
    const result = clientIpFrom({ clientIp: 12345 });

    expect(result.failOpen).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("logs a safe, structured warning (no PII/full context dump) on fail-open", () => {
    clientIpFrom({});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("clientIpFrom"),
    );
    const loggedArgs = warnSpy.mock.calls[0];
    expect(JSON.stringify(loggedArgs)).not.toContain("password");
  });
});
