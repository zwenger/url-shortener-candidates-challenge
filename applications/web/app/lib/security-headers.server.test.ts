import { afterEach, describe, expect, it, vi } from "vitest";
import { securityHeaders } from "./security-headers.server";

function buildResponse() {
  const headers = new Map<string, string>();
  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    headers,
    locals: {} as { nonce?: string },
  };
}

describe("securityHeaders middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets baseline security headers and calls next()", () => {
    const res = buildResponse();
    const next = vi.fn();

    securityHeaders({} as never, res as never, next);

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("generates a per-request nonce, stores it on res.locals, and includes it in script-src", () => {
    const res = buildResponse();

    securityHeaders({} as never, res as never, vi.fn());

    expect(res.locals.nonce).toBeTruthy();
    expect(res.headers.get("Content-Security-Policy")).toContain(
      `script-src 'self' 'nonce-${res.locals.nonce}'`,
    );
  });

  it("generates a different nonce on each request", () => {
    const resA = buildResponse();
    const resB = buildResponse();

    securityHeaders({} as never, resA as never, vi.fn());
    securityHeaders({} as never, resB as never, vi.fn());

    expect(resA.locals.nonce).not.toBe(resB.locals.nonce);
  });

  it("does not set Strict-Transport-Security outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = buildResponse();

    securityHeaders({} as never, res as never, vi.fn());

    expect(res.headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("sets Strict-Transport-Security in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = buildResponse();

    securityHeaders({} as never, res as never, vi.fn());

    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });
});
