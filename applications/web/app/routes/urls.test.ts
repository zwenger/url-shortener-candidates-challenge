import { createEngine } from "@url-shortener/engine";
import { InMemoryUrlRepository } from "@url-shortener/engine/testing";
import { describe, expect, it, vi } from "vitest";

const testRepository = new InMemoryUrlRepository();
const testEngine = createEngine({ repository: testRepository });

vi.mock("~/lib/engine.server", () => ({
  engine: testEngine,
}));

describe("/urls loader", () => {
  it("returns all URLs newest first with code, longUrl, clickCount, lastClickedAt, createdAt", async () => {
    const { engine } = await import("~/lib/engine.server");
    const { loader } = await import("./urls");

    await engine.shortenUrl("https://example.com/a");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await engine.shortenUrl("https://example.com/b");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await engine.shortenUrl("https://example.com/c");

    const result = await loader();

    expect(result).toHaveLength(3);
    expect(result[0].longUrl).toBe("https://example.com/c");
    expect(result[1].longUrl).toBe("https://example.com/b");
    expect(result[2].longUrl).toBe("https://example.com/a");
    for (const entry of result) {
      expect(entry).toHaveProperty("code");
      expect(entry).toHaveProperty("longUrl");
      expect(entry).toHaveProperty("clickCount");
      expect(entry).toHaveProperty("lastClickedAt");
      expect(entry).toHaveProperty("createdAt");
    }
  });

  it("returns an empty array when the repository is empty", async () => {
    const emptyRepository = new InMemoryUrlRepository();
    const emptyEngine = createEngine({ repository: emptyRepository });
    vi.doMock("~/lib/engine.server", () => ({ engine: emptyEngine }));
    vi.resetModules();

    const { loader } = await import("./urls");

    const result = await loader();

    expect(result).toEqual([]);
  });

  it("lists a never-clicked URL with clickCount 0 and lastClickedAt null", async () => {
    const freshRepository = new InMemoryUrlRepository();
    const freshEngine = createEngine({ repository: freshRepository });
    vi.doMock("~/lib/engine.server", () => ({ engine: freshEngine }));
    vi.resetModules();

    const { loader } = await import("./urls");
    await freshEngine.shortenUrl("https://example.com/never-clicked");

    const result = await loader();

    expect(result).toHaveLength(1);
    expect(result[0].clickCount).toBe(0);
    expect(result[0].lastClickedAt).toBeNull();
  });
});
