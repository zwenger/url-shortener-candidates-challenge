import { afterEach, describe, expect, it, vi } from "vitest";
import { handleError } from "./entry.server";

// `handleError` is React Router's official server-side error hook. Loader and
// action errors (e.g. the DB being down on the redirect path) otherwise reach
// the root ErrorBoundary unlogged, so operators have no server-side signal.
// Following RR convention, it must stay silent when the request was aborted
// (a client disconnect is not a server fault).
describe("entry.server handleError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function requestWith(aborted: boolean): Request {
    const controller = new AbortController();
    if (aborted) {
      controller.abort();
    }
    return new Request("https://sho.rt/s/abc123", {
      method: "GET",
      signal: controller.signal,
    });
  }

  it("logs the error with request method and url for a real error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("database is down");

    handleError(error, { request: requestWith(false) });

    expect(spy).toHaveBeenCalledTimes(1);
    const [loggedError, meta] = spy.mock.calls[0];
    expect(loggedError).toBe(error);
    expect((loggedError as Error).message).toBe("database is down");
    expect(meta).toMatchObject({
      method: "GET",
      url: "https://sho.rt/s/abc123",
    });
  });

  it("stays silent when the request was aborted (client disconnect)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    handleError(new Error("aborted mid-flight"), {
      request: requestWith(true),
    });

    expect(spy).not.toHaveBeenCalled();
  });
});
