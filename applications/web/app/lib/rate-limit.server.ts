/**
 * A pure, framework-agnostic in-memory token-bucket rate limiter.
 *
 * No Express/React-Router dependency on purpose — this stays independently
 * unit-testable and reusable if the wiring layer ever changes.
 *
 * The backing store is a size-capped `Map` (insertion order == recency of
 * *creation*, not of last use) so it cannot grow unboundedly: once `maxKeys`
 * is exceeded, the oldest tracked key is evicted. This is a bounded-memory
 * safety valve, not an LRU cache — see design.md for the residual tradeoff
 * (a very active key created long ago could still be evicted before an
 * idle key created more recently).
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterOptions {
  /** Maximum number of tokens (and therefore requests) a bucket can hold. */
  capacity: number;
  /** Tokens added back per second. */
  refillPerSec: number;
  /** Injectable clock for deterministic tests (defaults to `Date.now`). */
  now?: () => number;
  /** Maximum number of distinct keys tracked before evicting the oldest. */
  maxKeys?: number;
}

export interface RateLimiter {
  /** Returns `true` if a token was available and consumed, `false` otherwise. */
  take(key: string): boolean;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const {
    capacity,
    refillPerSec,
    now = Date.now,
    maxKeys = DEFAULT_MAX_KEYS,
  } = options;
  const buckets = new Map<string, Bucket>();

  function refill(bucket: Bucket, timestamp: number): void {
    const elapsedSec = (timestamp - bucket.lastRefill) / 1000;
    if (elapsedSec <= 0) {
      return;
    }
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + elapsedSec * refillPerSec,
    );
    bucket.lastRefill = timestamp;
  }

  function getOrCreateBucket(key: string, timestamp: number): Bucket {
    const existing = buckets.get(key);
    if (existing) {
      refill(existing, timestamp);
      return existing;
    }

    if (buckets.size >= maxKeys) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) {
        buckets.delete(oldestKey);
      }
    }

    const created: Bucket = { tokens: capacity, lastRefill: timestamp };
    buckets.set(key, created);
    return created;
  }

  return {
    take(key: string): boolean {
      const timestamp = now();
      const bucket = getOrCreateBucket(key, timestamp);

      if (bucket.tokens < 1) {
        return false;
      }

      bucket.tokens -= 1;
      return true;
    },
  };
}
