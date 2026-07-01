import { createEngine } from "@url-shortener/engine";
import { InMemoryUrlRepository } from "@url-shortener/engine/testing";
import { describe, expect, it, vi } from "vitest";
import type { Route as IndexRoute } from "./+types/_index";
import type { Route as CodeRoute } from "./+types/s.$code";

const testEngine = createEngine({ repository: new InMemoryUrlRepository() });

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
});
