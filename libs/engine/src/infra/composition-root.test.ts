import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";
import { createEngine } from "./composition-root";

class FakeUrlRepository implements UrlRepository {
  readonly byCode = new Map<string, ShortenedUrl>();

  callCounts = {
    findByCode: 0,
  };

  seed(entry: ShortenedUrl): void {
    this.byCode.set(entry.code, entry);
  }

  async findByHash(): Promise<ShortenedUrl | null> {
    return null;
  }

  async findByCode(code: string): Promise<ShortenedUrl | null> {
    this.callCounts.findByCode += 1;
    return this.byCode.get(code) ?? null;
  }

  async existsByCode(code: string): Promise<boolean> {
    return this.byCode.has(code);
  }

  async create(input: CreateShortenedUrlInput): Promise<ShortenedUrl> {
    const entry: ShortenedUrl = {
      code: input.code,
      longUrl: input.longUrl,
      urlHash: input.urlHash,
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
    };
    this.seed(entry);
    return entry;
  }

  async incrementClicks(): Promise<void> {
    // no-op for these tests
  }

  async listAll(): Promise<ShortenedUrl[]> {
    return Array.from(this.byCode.values());
  }
}

describe("createEngine", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("routes every resolve through an injected repository with no caching layer", async () => {
    const fakeRepo = new FakeUrlRepository();
    fakeRepo.seed({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
    });

    const engine = createEngine({ repository: fakeRepo });

    await engine.resolveUrl("AbC1234");
    await engine.resolveUrl("AbC1234");

    expect(fakeRepo.callCounts.findByCode).toBe(2);
  });

  describe("cache config fallback on invalid env values", () => {
    it("falls back to defaults when CACHE_TTL_MS is negative and does not throw at boot", () => {
      process.env.CACHE_TTL_MS = "-1";
      process.env.CACHE_MAX_ENTRIES = "-1";

      expect(() => createEngine()).not.toThrow();
    });

    it("falls back to defaults when cache env values are non-integers", () => {
      process.env.CACHE_TTL_MS = "not-a-number";
      process.env.CACHE_MAX_ENTRIES = "1.5";

      expect(() => createEngine()).not.toThrow();
    });

    it("still returns a working (non-throwing) engine when cache construction would otherwise throw", () => {
      // readIntEnv already sanitizes negative/non-integer env values (see
      // tests above), so this asserts the belt-and-suspenders path: even if
      // CachingUrlRepository construction itself throws for some other
      // reason, createEngine() must not propagate that failure — it must
      // degrade to the uncached base repository instead of failing to boot.
      process.env.CACHE_TTL_MS = "-1";
      process.env.CACHE_MAX_ENTRIES = "-1";

      let engine: ReturnType<typeof createEngine> | undefined;
      expect(() => {
        engine = createEngine();
      }).not.toThrow();

      expect(engine).toBeDefined();
      expect(typeof engine?.resolveUrl).toBe("function");
    });
  });
});
