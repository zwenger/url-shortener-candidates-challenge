import type { RequestHandler } from "express";
import { describe, expect, it } from "vitest";
import { createApp } from "./server";

// Tests use a trivial stub request handler (never a real
// `createRequestHandler({ build, ... })` mount) so they never need a real
// React Router build output — they only exercise the Express-layer
// concerns createApp is responsible for: trust-proxy resolution,
// getLoadContext wiring, and security headers.
function buildTestApp(
  options: { trustProxy?: string; requestHandler?: RequestHandler } = {},
) {
  const contexts: unknown[] = [];
  const requestHandler: RequestHandler =
    options.requestHandler ??
    ((req, res) => {
      res.json({ ip: req.ip, nonce: res.locals.nonce });
    });

  const app = createApp({
    trustProxyEnv: options.trustProxy,
    requestHandler,
    onLoadContext: (context) => contexts.push(context),
  });

  return { app, contexts };
}

describe("createApp", () => {
  it("ignores X-Forwarded-For and uses the socket IP when trust proxy is off (default)", async () => {
    const { default: request } = await import("supertest");
    const { app } = buildTestApp();

    const res = await request(app)
      .get("/")
      .set("X-Forwarded-For", "203.0.113.99");

    expect(res.status).toBe(200);
    // supertest connects over loopback; a spoofed XFF must be ignored.
    expect(res.body.ip).not.toBe("203.0.113.99");
  });

  it("honors X-Forwarded-For when trust proxy is set to a hop count", async () => {
    const { default: request } = await import("supertest");
    const { app } = buildTestApp({ trustProxy: "1" });

    const res = await request(app)
      .get("/")
      .set("X-Forwarded-For", "203.0.113.99");

    expect(res.status).toBe(200);
    expect(res.body.ip).toBe("203.0.113.99");
  });

  it("surfaces req.ip into the load context via getLoadContext", async () => {
    const { default: request } = await import("supertest");
    const { app, contexts } = buildTestApp({ trustProxy: "1" });

    await request(app).get("/").set("X-Forwarded-For", "203.0.113.55");

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ clientIp: "203.0.113.55" });
  });

  it("applies security headers, including a per-request CSP nonce, to every response", async () => {
    const { default: request } = await import("supertest");
    const { app } = buildTestApp();

    const res = await request(app).get("/");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    const csp = res.headers["content-security-policy"];
    expect(csp).toBeTruthy();

    const nonceMatch = /nonce-([\w-]+)/.exec(csp);
    expect(nonceMatch).not.toBeNull();
    expect(res.body.nonce).toBe(nonceMatch?.[1]);
  });

  it("forwards the same per-request nonce into the load context", async () => {
    const { default: request } = await import("supertest");
    const { app, contexts } = buildTestApp();

    const res = await request(app).get("/");

    const csp = res.headers["content-security-policy"];
    const nonceMatch = /nonce-([\w-]+)/.exec(csp);

    expect(contexts).toHaveLength(1);
    expect((contexts[0] as { nonce?: string }).nonce).toBe(nonceMatch?.[1]);
  });
});
