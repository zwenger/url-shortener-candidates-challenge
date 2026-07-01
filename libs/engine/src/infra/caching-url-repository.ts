import { LRUCache } from "lru-cache";
import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";

export interface CacheConfig {
  readonly maxEntries: number;
  readonly ttlMs: number;
}

function toSentinelShortenedUrl(code: string, longUrl: string): ShortenedUrl {
  return {
    code,
    longUrl,
    urlHash: "",
    clickCount: -1,
    lastClickedAt: null,
    createdAt: new Date(0),
  };
}

export class CachingUrlRepository implements UrlRepository {
  private readonly cache: LRUCache<string, string>;

  constructor(
    private readonly inner: UrlRepository,
    config: CacheConfig,
  ) {
    this.cache = new LRUCache<string, string>({
      max: config.maxEntries,
      ttl: config.ttlMs,
      // `lru-cache` defaults to `performance.now()`, which vitest's fake
      // timers do not advance by default. Using `Date` keeps TTL expiry
      // deterministically testable via `vi.advanceTimersByTime` and behaves
      // identically in production (both are monotonically increasing clocks
      // for this use case).
      perf: Date,
    });
  }

  async findByHash(urlHash: string): Promise<ShortenedUrl | null> {
    return this.inner.findByHash(urlHash);
  }

  async findByCode(code: string): Promise<ShortenedUrl | null> {
    let cachedLongUrl: string | undefined;
    try {
      cachedLongUrl = this.cache.get(code);
    } catch {
      cachedLongUrl = undefined;
    }

    if (cachedLongUrl !== undefined) {
      return toSentinelShortenedUrl(code, cachedLongUrl);
    }

    const result = await this.inner.findByCode(code);
    if (result !== null) {
      try {
        this.cache.set(code, result.longUrl);
      } catch {
        // Cache write failure must not break the redirect; the underlying
        // result is still returned, just not cached for next time.
      }
    }
    return result;
  }

  async existsByCode(code: string): Promise<boolean> {
    return this.inner.existsByCode(code);
  }

  async create(input: CreateShortenedUrlInput): Promise<ShortenedUrl> {
    return this.inner.create(input);
  }

  async incrementClicks(code: string): Promise<void> {
    return this.inner.incrementClicks(code);
  }

  async listAll(): Promise<ShortenedUrl[]> {
    return this.inner.listAll();
  }
}
