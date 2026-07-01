import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";
import {
  type CacheConfig,
  CachingUrlRepository,
} from "./caching-url-repository";

const DEFAULT_CONFIG: CacheConfig = { maxEntries: 1000, ttlMs: 300_000 };

class FakeUrlRepository implements UrlRepository {
  readonly byCode = new Map<string, ShortenedUrl>();
  readonly byHash = new Map<string, ShortenedUrl>();

  callCounts = {
    findByHash: 0,
    findByCode: 0,
    existsByCode: 0,
    create: 0,
    incrementClicks: 0,
    listAll: 0,
  };

  seed(entry: ShortenedUrl): void {
    this.byCode.set(entry.code, entry);
    this.byHash.set(entry.urlHash, entry);
  }

  async findByHash(urlHash: string): Promise<ShortenedUrl | null> {
    this.callCounts.findByHash += 1;
    return this.byHash.get(urlHash) ?? null;
  }

  async findByCode(code: string): Promise<ShortenedUrl | null> {
    this.callCounts.findByCode += 1;
    return this.byCode.get(code) ?? null;
  }

  async existsByCode(code: string): Promise<boolean> {
    this.callCounts.existsByCode += 1;
    return this.byCode.has(code);
  }

  async create(input: CreateShortenedUrlInput): Promise<ShortenedUrl> {
    this.callCounts.create += 1;
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

  async incrementClicks(code: string): Promise<void> {
    this.callCounts.incrementClicks += 1;
    const existing = this.byCode.get(code);
    if (existing) {
      this.byCode.set(code, {
        ...existing,
        clickCount: existing.clickCount + 1,
        lastClickedAt: new Date(),
      });
    }
  }

  async listAll(): Promise<ShortenedUrl[]> {
    this.callCounts.listAll += 1;
    return Array.from(this.byCode.values());
  }
}

function makeEntry(overrides: Partial<ShortenedUrl> = {}): ShortenedUrl {
  return {
    code: "AbC1234",
    longUrl: "https://example.com/a",
    urlHash: "hash-a",
    clickCount: 3,
    lastClickedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

describe("CachingUrlRepository", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pass-through operations", () => {
    it("delegates findByHash to the underlying repository on every call", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(makeEntry());
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      await repo.findByHash("hash-a");
      await repo.findByHash("hash-a");

      expect(inner.callCounts.findByHash).toBe(2);
    });

    it("delegates existsByCode and returns the underlying result unchanged", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(makeEntry());
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      const result = await repo.existsByCode("AbC1234");

      expect(inner.callCounts.existsByCode).toBe(1);
      expect(result).toBe(true);
    });

    it("delegates create with the same input and does not touch the cache", async () => {
      const inner = new FakeUrlRepository();
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);
      const input: CreateShortenedUrlInput = {
        code: "NeW1234",
        longUrl: "https://example.com/new",
        urlHash: "hash-new",
      };

      const created = await repo.create(input);

      expect(inner.callCounts.create).toBe(1);
      expect(created.code).toBe("NeW1234");
      expect(created.longUrl).toBe("https://example.com/new");
    });

    it("delegates listAll on every call and never caches the result", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(makeEntry());
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      await repo.listAll();
      await repo.listAll();

      expect(inner.callCounts.listAll).toBe(2);
    });
  });

  describe("cache-aside on findByCode", () => {
    it("populates the cache from the underlying repository on a miss", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      const result = await repo.findByCode("AbC1234");

      expect(inner.callCounts.findByCode).toBe(1);
      expect(result?.longUrl).toBe("https://example.com/a");
    });

    it("serves the correct longUrl on a cache hit without hitting the underlying repository", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      await repo.findByCode("AbC1234");
      const result = await repo.findByCode("AbC1234");

      expect(inner.callCounts.findByCode).toBe(1);
      expect(result?.longUrl).toBe("https://example.com/a");
    });

    it("returns sentinel count fields on a cache hit, never a real/stale count", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({
          code: "AbC1234",
          longUrl: "https://example.com/a",
          clickCount: 42,
          lastClickedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      await repo.findByCode("AbC1234");
      const hit = await repo.findByCode("AbC1234");

      expect(hit?.clickCount).toBe(-1);
      expect(hit?.lastClickedAt).toBeNull();
      expect(hit?.createdAt.getTime()).toBe(new Date(0).getTime());
      expect(hit?.urlHash).toBe("");
    });

    it("does not cache an unknown code as a false negative", async () => {
      const inner = new FakeUrlRepository();
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);

      const first = await repo.findByCode("zzzzzzz");
      const second = await repo.findByCode("zzzzzzz");

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(inner.callCounts.findByCode).toBe(2);
    });
  });

  describe("incrementClicks isolation", () => {
    it("delegates incrementClicks and leaves the findByCode cache untouched", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);
      await repo.findByCode("AbC1234");
      const findByCodeCallsBefore = inner.callCounts.findByCode;

      await repo.incrementClicks("AbC1234");

      expect(inner.callCounts.incrementClicks).toBe(1);

      await repo.findByCode("AbC1234");
      expect(inner.callCounts.findByCode).toBe(findByCodeCallsBefore);
    });
  });

  describe("LRU eviction", () => {
    it("evicts the least-recently-used entry beyond capacity", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({
          code: "A",
          longUrl: "https://example.com/a",
          urlHash: "hash-a",
        }),
      );
      inner.seed(
        makeEntry({
          code: "B",
          longUrl: "https://example.com/b",
          urlHash: "hash-b",
        }),
      );
      inner.seed(
        makeEntry({
          code: "C",
          longUrl: "https://example.com/c",
          urlHash: "hash-c",
        }),
      );
      const repo = new CachingUrlRepository(inner, {
        maxEntries: 2,
        ttlMs: 300_000,
      });

      await repo.findByCode("A");
      await repo.findByCode("B");
      await repo.findByCode("C");
      const callsAfterFill = inner.callCounts.findByCode;

      await repo.findByCode("B");
      expect(inner.callCounts.findByCode).toBe(callsAfterFill);

      await repo.findByCode("A");
      expect(inner.callCounts.findByCode).toBe(callsAfterFill + 1);
    });
  });

  describe("TTL expiry", () => {
    it("forces a re-fetch after the configured TTL elapses", async () => {
      vi.useFakeTimers();
      const ttlMs = 1000;
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, { maxEntries: 1000, ttlMs });

      await repo.findByCode("AbC1234");
      expect(inner.callCounts.findByCode).toBe(1);

      vi.advanceTimersByTime(ttlMs + 1);

      await repo.findByCode("AbC1234");
      expect(inner.callCounts.findByCode).toBe(2);
    });
  });

  describe("graceful fallback on cache error", () => {
    it("falls back to the underlying repository when the cache throws on read", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);
      const cache = (repo as unknown as { cache: { get: () => string } }).cache;
      cache.get = () => {
        throw new Error("simulated cache read failure");
      };

      const result = await repo.findByCode("AbC1234");

      expect(inner.callCounts.findByCode).toBe(1);
      expect(result?.longUrl).toBe("https://example.com/a");
    });

    it("falls back to the underlying result when the cache throws on write", async () => {
      const inner = new FakeUrlRepository();
      inner.seed(
        makeEntry({ code: "AbC1234", longUrl: "https://example.com/a" }),
      );
      const repo = new CachingUrlRepository(inner, DEFAULT_CONFIG);
      const cache = (repo as unknown as { cache: { set: () => void } }).cache;
      cache.set = () => {
        throw new Error("simulated cache write failure");
      };

      const result = await repo.findByCode("AbC1234");

      expect(inner.callCounts.findByCode).toBe(1);
      expect(result?.longUrl).toBe("https://example.com/a");
    });
  });
});
