import { createEngine } from "@url-shortener/engine";
import { InMemoryUrlRepository } from "@url-shortener/engine/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route as IndexRoute } from "./+types/_index";

const testRepository = new InMemoryUrlRepository();
const testEngine = createEngine({ repository: testRepository });

vi.mock("~/lib/engine.server", () => ({
  engine: testEngine,
}));

function buildActionArgs(
  request: Request,
  clientIp: string,
): IndexRoute.ActionArgs {
  return { request, context: { clientIp } } as unknown as IndexRoute.ActionArgs;
}

function shortenRequest(url: string): Request {
  const formData = new FormData();
  formData.set("url", url);
  return new Request("http://localhost/", { method: "POST", body: formData });
}

describe("shorten action: rate limiting", () => {
  it("returns 429 on the 11th shorten request from the same IP and does not shorten it", async () => {
    const { action } = await import("./_index");
    const ip = "203.0.113.10";
    const shortenSpy = vi.spyOn(testEngine, "shortenUrl");

    for (let i = 0; i < 10; i++) {
      const result = await action(
        buildActionArgs(shortenRequest(`https://example.com/a${i}`), ip),
      );
      expect(result).not.toMatchObject({ init: { status: 429 } });
    }

    shortenSpy.mockClear();

    const eleventh = await action(
      buildActionArgs(shortenRequest("https://example.com/a11"), ip),
    );

    expect(eleventh).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 429 },
    });
    expect(shortenSpy).not.toHaveBeenCalled();

    shortenSpy.mockRestore();
  });

  it("exposes Retry-After via the route's headers() export so it reaches the document response", async () => {
    const { action, headers } = await import("./_index");
    const ip = "203.0.113.11";

    for (let i = 0; i < 10; i++) {
      await action(
        buildActionArgs(shortenRequest(`https://example.com/h${i}`), ip),
      );
    }

    const eleventh = await action(
      buildActionArgs(shortenRequest("https://example.com/h11"), ip),
    );
    const actionHeaders =
      eleventh && typeof eleventh === "object" && "init" in eleventh
        ? new Headers(
            (eleventh as { init?: { headers?: HeadersInit } }).init?.headers,
          )
        : new Headers();

    const merged = headers({
      actionHeaders,
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
      errorHeaders: undefined,
    });

    expect(new Headers(merged).get("Retry-After")).toBe("60");
  });

  it("does not throttle a different IP after another IP exhausts its bucket", async () => {
    const { action } = await import("./_index");
    const exhaustedIp = "203.0.113.20";
    const freshIp = "203.0.113.21";

    for (let i = 0; i < 10; i++) {
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
});

describe("shorten action: SSRF host blocking", () => {
  beforeEach(() => {
    // Each test in this describe block uses a fresh, dedicated IP so the
    // rate-limiting tests above never interfere with these assertions.
  });

  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://169.254.169.254/",
    "http://localhost:3000/",
  ])("maps a BlockedHostError to HTTP 400 and does not persist a record: %s", async (blockedUrl) => {
    const { action } = await import("./_index");
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 30}`;

    const result = await action(
      buildActionArgs(shortenRequest(blockedUrl), ip),
    );

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 400 },
    });
  });
});
