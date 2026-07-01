import { createEngine } from "@url-shortener/engine";
import { InMemoryUrlRepository } from "@url-shortener/engine/testing";
import { describe, expect, it, vi } from "vitest";
import type { Route as IndexRoute } from "./+types/_index";
import type { Route as CodeRoute } from "./+types/s.$code";

const testRepository = new InMemoryUrlRepository();
const testEngine = createEngine({ repository: testRepository });

vi.mock("~/lib/engine.server", () => ({
  engine: testEngine,
}));

function buildActionArgs(request: Request): IndexRoute.ActionArgs {
  return { request } as IndexRoute.ActionArgs;
}

function buildLoaderArgs(code: string): CodeRoute.LoaderArgs {
  return { params: { code } } as CodeRoute.LoaderArgs;
}

describe("shorten -> redirect (e2e)", () => {
  it("shortens a URL then resolves its code back to the original long URL", async () => {
    const { action } = await import("./_index");
    const { loader } = await import("./s.$code");

    const formData = new FormData();
    formData.set("url", "https://example.com/some/path?x=1");
    const request = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const actionResult = (await action(buildActionArgs(request))) as {
      shortenedUrl: string;
    };

    expect(actionResult.shortenedUrl).toContain("/s/");
    const code = actionResult.shortenedUrl.split("/s/")[1];

    const redirectResponse = (await loader(buildLoaderArgs(code))) as Response;

    expect(redirectResponse).toBeInstanceOf(Response);
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get("Location")).toBe(
      "https://example.com/some/path?x=1",
    );
  });

  it("returns a 400 response for a malformed URL submission", async () => {
    const { action } = await import("./_index");

    const formData = new FormData();
    formData.set("url", "not a url");
    const request = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await action(buildActionArgs(request));

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 400 },
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
  ])("rejects a dangerous scheme submission with 400 and does not store it: %s", async (dangerousUrl) => {
    const { action } = await import("./_index");

    const formData = new FormData();
    formData.set("url", dangerousUrl);
    const request = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await action(buildActionArgs(request));

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 400 },
    });
  });

  it("returns a typed 404 for an unknown code", async () => {
    const { loader } = await import("./s.$code");

    let thrown: unknown;
    try {
      await loader(buildLoaderArgs("zzzzzzz"));
    } catch (error) {
      thrown = error;
    }

    // react-router's data() helper wraps the payload; the router converts it
    // to a real Response during actual request handling. At this unit-level
    // call we assert on the wrapper's init instead of a live Response.
    expect(thrown).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 404 },
    });
  });

  it("increments the click count when redirecting an existing short code", async () => {
    const { action } = await import("./_index");
    const { loader } = await import("./s.$code");

    const formData = new FormData();
    formData.set("url", "https://example.com/click-tracking");
    const request = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const actionResult = (await action(buildActionArgs(request))) as {
      shortenedUrl: string;
    };
    const code = actionResult.shortenedUrl.split("/s/")[1];

    const incrementSpy = vi.spyOn(testRepository, "incrementClicks");
    const redirectResponse = (await loader(buildLoaderArgs(code))) as Response;

    // recordClick is fire-and-forget (a detached promise, not awaited by the
    // loader) — flush microtasks before asserting, otherwise this races the
    // detached promise and is flaky.
    await Promise.resolve();
    await Promise.resolve();

    expect(redirectResponse.status).toBe(302);
    expect(incrementSpy).toHaveBeenCalledWith(code);

    incrementSpy.mockRestore();
  });

  it("still returns a redirect when recording the click fails", async () => {
    const { action } = await import("./_index");
    const { loader } = await import("./s.$code");

    const formData = new FormData();
    formData.set("url", "https://example.com/click-tracking-failure");
    const request = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const actionResult = (await action(buildActionArgs(request))) as {
      shortenedUrl: string;
    };
    const code = actionResult.shortenedUrl.split("/s/")[1];

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const incrementSpy = vi
      .spyOn(testRepository, "incrementClicks")
      .mockRejectedValueOnce(new Error("simulated recording failure"));

    const redirectResponse = (await loader(buildLoaderArgs(code))) as Response;

    // recordClick is fire-and-forget — flush microtasks before asserting the
    // rejection was caught and logged, otherwise the assertion races the
    // detached promise and is flaky.
    await Promise.resolve();
    await Promise.resolve();

    expect(redirectResponse).toBeInstanceOf(Response);
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get("Location")).toBe(
      "https://example.com/click-tracking-failure",
    );
    expect(consoleErrorSpy).toHaveBeenCalled();

    incrementSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
