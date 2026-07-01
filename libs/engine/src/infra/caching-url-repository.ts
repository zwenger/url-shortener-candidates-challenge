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

/**
 * Minimal surface `CachingUrlRepository` needs from a cache implementation.
 * `LRUCache` satisfies this structurally. Exposed so tests can inject a
 * fake/throwing store via the constructor instead of reaching into the
 * repository's private `cache` field.
 */
export interface CacheStore<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

/**
 * Reconstructs a minimal `ShortenedUrl` from a cache hit.
 *
 * Only `longUrl` is ever cached (see CacheConfig usage in the composition
 * root and the design decision it implements) — the mutable `clickCount` /
 * `lastClickedAt` fields are never cached, so they can never be served
 * stale. The sentinel values below (`clickCount: -1`, `urlHash: ""`,
 * `createdAt` at the epoch, `lastClickedAt: null`) are intentionally
 * invalid: any future caller that reads them as real data will get an
 * obviously wrong value and fail loudly, instead of silently trusting
 * fabricated or stale data. Today the only caller of `findByCode` is
 * `ResolveUrlUseCase`, whose redirect path reads `longUrl` exclusively —
 * that is the sole consumer allowed to rely on a cache hit.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  private readonly cache: CacheStore<string, string>;

  constructor(
    private readonly inner: UrlRepository,
    config: CacheConfig,
    cacheStore?: CacheStore<string, string>,
  ) {
    this.cache =
      cacheStore ??
      new LRUCache<string, string>({
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

  // Policy for both catch blocks below: a cache failure (read or write) must
  // never break the redirect path. We log a warning (message/code only —
  // never the full error object, to avoid leaking stack traces or unrelated
  // context into logs) and degrade gracefully to the underlying repository.
  async findByCode(code: string): Promise<ShortenedUrl | null> {
    let cachedLongUrl: string | undefined;
    try {
      cachedLongUrl = this.cache.get(code);
    } catch (error) {
      console.warn(
        `CachingUrlRepository: cache read failed, falling back to underlying repository (${errorMessage(error)})`,
      );
      cachedLongUrl = undefined;
    }

    if (cachedLongUrl !== undefined) {
      return toSentinelShortenedUrl(code, cachedLongUrl);
    }

    const result = await this.inner.findByCode(code);
    if (result !== null) {
      try {
        this.cache.set(code, result.longUrl);
      } catch (error) {
        console.warn(
          `CachingUrlRepository: cache write failed, degrading to no-cache for this entry (${errorMessage(error)})`,
        );
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
