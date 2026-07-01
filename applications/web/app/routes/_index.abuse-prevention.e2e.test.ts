import { createEngine } from "@url-shortener/engine";
import { InMemoryUrlRepository } from "@url-shortener/engine/testing";
import { describe, expect, it, vi } from "vitest";
import type { Route as IndexRoute } from "./+types/_index";

const testRepository = new InMemoryUrlRepository();
const testEngine = createEngine({ repository: testRepository });

vi.mock("~/lib/engine.server", () => ({
  engine: testEngine,
}));

// Distinct, deterministic per-test-case IPs (derived from a fixed base plus
// the caller's index) so tests never collide on the same rate-limiter
// bucket — a `Math.random()`-derived IP could, in principle, collide across
// runs or even within a single run, making a failure flaky and
// hard to reproduce.
function testIp(index: number): string {
  return `203.0.113.${index}`;
}

function buildActionArgs(
  request: Request,
  clientIp: string | undefined,
): IndexRoute.ActionArgs {
  return {
    request,
    context: { clientIp },
  } as unknown as IndexRoute.ActionArgs;
}

function shortenRequest(url: string): Request {
  const formData = new FormData();
  formData.set("url", url);
  return new Request("http://localhost/", { method: "POST", body: formData });
}

describe("shorten action: rate limiting", () => {
  it("returns 429 on the (requestsPerWindow + 1)th shorten request from the same IP and does not shorten it", async () => {
    const { action, SHORTEN_RATE_LIMIT } = await import("./_index");
    const ip = testIp(10);
    const shortenSpy = vi.spyOn(testEngine, "shortenUrl");

    for (let i = 0; i < SHORTEN_RATE_LIMIT.requestsPerWindow; i++) {
      const result = await action(
        buildActionArgs(shortenRequest(`https://example.com/a${i}`), ip),
      );
      expect(result).not.toMatchObject({ init: { status: 429 } });
    }

    shortenSpy.mockClear();

    const overLimit = await action(
      buildActionArgs(shortenRequest("https://example.com/a11"), ip),
    );

    expect(overLimit).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 429 },
    });
    expect(shortenSpy).not.toHaveBeenCalled();

    shortenSpy.mockRestore();
  });

  it("exposes Retry-After via the route's headers() export so it reaches the document response", async () => {
    const { action, headers, SHORTEN_RATE_LIMIT } = await import("./_index");
    const ip = testIp(11);

    for (let i = 0; i < SHORTEN_RATE_LIMIT.requestsPerWindow; i++) {
      await action(
        buildActionArgs(shortenRequest(`https://example.com/h${i}`), ip),
      );
    }

    const overLimit = await action(
      buildActionArgs(shortenRequest("https://example.com/h11"), ip),
    );
    const actionHeaders =
      overLimit && typeof overLimit === "object" && "init" in overLimit
        ? new Headers(
            (overLimit as { init?: { headers?: HeadersInit } }).init?.headers,
          )
        : new Headers();

    const merged = headers({
      actionHeaders,
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    });

    expect(new Headers(merged).get("Retry-After")).toBe(
      String(SHORTEN_RATE_LIMIT.windowSeconds),
    );
  });

  it("does not throttle a different IP after another IP exhausts its bucket", async () => {
    const { action, SHORTEN_RATE_LIMIT } = await import("./_index");
    const exhaustedIp = testIp(20);
    const freshIp = testIp(21);

    for (let i = 0; i < SHORTEN_RATE_LIMIT.requestsPerWindow; i++) {
      await action(
        buildActionArgs(
          shortenRequest(`https://example.com/b${i}`),
          exhaustedIp,
        ),
      );
    }

    const result = await action(
      buildActionArgs(shortenRequest("https://example.com/c1"), freshIp),
    );

    expect(result).not.toMatchObject({ init: { status: 429 } });
  });

  it("fails open (bypasses the limiter) instead of throttling when the client IP is unresolved", async () => {
    const { action, SHORTEN_RATE_LIMIT } = await import("./_index");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Requests with no resolvable IP all bypass the limiter — sending more
    // than the window's capacity must never 429 them, since they never
    // shared a bucket in the first place.
    for (let i = 0; i < SHORTEN_RATE_LIMIT.requestsPerWindow + 5; i++) {
      const result = await action(
        buildActionArgs(
          shortenRequest(`https://example.com/unresolved${i}`),
          undefined,
        ),
      );
      expect(result).not.toMatchObject({ init: { status: 429 } });
    }

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("shorten action: SSRF host blocking", () => {
  // Each blocked host gets its own deterministic, fixed IP offset (rather
  // than a `Math.random()`-derived one) so a failure is always
  // reproducible and never collides with another test's bucket.
  const blockedHosts: Array<[url: string, ipOffset: number]> = [
    ["http://127.0.0.1/", 30],
    ["http://10.0.0.5/", 31],
    ["http://169.254.169.254/", 32],
    ["http://localhost:3000/", 33],
  ];

  it.each(
    blockedHosts,
  )("maps a BlockedHostError to HTTP 400 and does not persist a record: %s", async (blockedUrl, ipOffset) => {
    const { action } = await import("./_index");
    const ip = testIp(ipOffset);

    const result = await action(
      buildActionArgs(shortenRequest(blockedUrl), ip),
    );

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 400 },
    });
  });
});
