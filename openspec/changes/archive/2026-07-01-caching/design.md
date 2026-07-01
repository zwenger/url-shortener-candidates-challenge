# Design: Redirect Read-Path Caching (Slice 3)

## Technical Approach

A `CachingUrlRepository` decorator implements `UrlRepository` and wraps the concrete repo (Prisma). It is constructed and injected at the `createEngine()` composition root — the Slice 1 documented hook — so use cases and routes are unchanged. Cache-aside applies to `findByCode` only (the redirect hot path); every other port method is a straight pass-through. The cache stores ONLY the immutable `code -> longUrl` string, never the mutable `ShortenedUrl` (LOCKED #823). This satisfies the sole `findByCode` caller — `ResolveUrlUseCase`, whose route consumer reads `shortenedUrl.longUrl` only (`s.$code.tsx:11`) — while making a stale `clickCount` structurally impossible to serve.

## Architecture Decisions

### Decision: What the cache stores (the key decision)

`findByCode` returns a full `ShortenedUrl`, but we cache only the `longUrl` string keyed by `code`. On a hit we reconstruct a minimal `ShortenedUrl` from the cached `longUrl`.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| (a) Cache `longUrl` string; reconstruct minimal entity on hit; count fields sentinel | Loses live `clickCount` on the reconstructed entity — but the only reader (`resolve`→route) uses `longUrl` alone; `listAll` (the count reader) bypasses the cache | **CHOSEN** |
| (b) Cache full entity, zero the count fields | Still fabricates a plausible-looking `clickCount: 0`; a future caller could mistake it for truth | Rejected |
| (c) Cache full entity, flag count "not authoritative" | Adds a non-authoritative flag to the domain read model to serve an infra concern — leaks caching into the domain | Rejected |

**Rationale**: Option (a) makes staleness *unrepresentable*: the mutable fields are never in the cache, so no cached value can ever leak a stale count. Reconstruction uses explicit sentinels that signal "not from a live row" without changing the domain type: `clickCount: -1`, `lastClickedAt: null`, `createdAt: new Date(0)` (epoch), and `urlHash: ""`. The redirect never reads these. If any future caller of `findByCode` needs live counts, it must not read them off this path — enforced by the sentinel being obviously invalid (`-1`), which fails loudly rather than silently lying. This is the seniority signal: we cache the *narrowest correct thing*, not the convenient thing.

### Decision: Cache-aside on findByCode; all else pass-through

| Method | Behavior | Why |
|--------|----------|-----|
| `findByCode` | Cache-aside: hit→reconstruct; miss→delegate, populate on non-null, return | Redirect hot path; target is immutable |
| `findByHash` | Pass-through | Shorten-time correctness; must see live rows |
| `existsByCode` | Pass-through | Collision check must be authoritative |
| `create` | Pass-through (no cache write) | Code was absent, nothing stale to evict; caching it pre-warms nothing the redirect needs yet — YAGNI |
| `incrementClicks` | Pass-through, cache untouched | Only immutable `longUrl` is cached; a click never invalidates it (LOCKED #823) — keeps the fire-and-forget click path fully decoupled |
| `listAll` | Pass-through, NEVER cached | Authoritative counts read fresh from DB |

Negative results (`null`) are NOT cached: a 404 today may be a valid code tomorrow after `create`, and we do not want to invalidate on `create`.

### Decision: `lru-cache` library, config-injectable

Use `lru-cache` (LOCKED #823) with `{ max: 1000, ttl: 5 * 60_000 }`. TTL is a safety net only (targets are effectively immutable after `create`); LRU `max` bounds memory. The decorator takes an injectable config so tests can pass a fake underlying repo AND control cache behavior deterministically. Env overrides: `CACHE_MAX_ENTRIES` (default 1000), `CACHE_TTL_MS` (default 300000); `CACHE_TTL_MS=0` disables TTL for determinism. Composition root reads env, but tests inject config directly.

### Decision: Graceful fallback on cache error

In-process `lru-cache` rarely throws, but the policy is explicit: any throw from a cache `get`/`set` is caught and the call falls through to the underlying repo. Caching must never break a redirect. A cache failure degrades to direct DB access — the pre-cache behavior.

## Data Flow

    resolve:  ResolveUrlUseCase ─▶ CachingUrlRepository.findByCode(code)
                                        │
                        cache.get(code) │
                     ┌── hit (longUrl) ─┘        └─ miss / cache throws
                     ▼                                    ▼
       reconstruct ShortenedUrl               underlying.findByCode(code)
       (sentinel count fields)                    │ null ─▶ return null (not cached)
                     │                             │ row  ─▶ cache.set(code, row.longUrl)
                     └──────────── longUrl ────────┴─▶ return ShortenedUrl
                                        │
                          route: redirect(shortenedUrl.longUrl)

    click:    RecordClickUseCase ─▶ CachingUrlRepository.incrementClicks(code)
                                        └─▶ underlying.incrementClicks(code)   (cache untouched)

    list:     ListUrlsUseCase ─▶ CachingUrlRepository.listAll() ─▶ underlying.listAll()  (never cached)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `libs/engine/src/infra/caching-url-repository.ts` | Create | Decorator implementing `UrlRepository`; cache-aside `findByCode`, pass-through rest |
| `libs/engine/src/infra/caching-url-repository.test.ts` | Create | Unit tests: hit/miss/populate/LRU/TTL/fallback/pass-through |
| `libs/engine/src/infra/composition-root.ts` | Modify | Wrap concrete repo: `new CachingUrlRepository(new PrismaUrlRepository(...), cacheConfig)`; read env for config |
| `libs/engine/package.json` | Modify | Add `lru-cache` dependency |
| `libs/engine/src/domain/*`, `application/*`, routes | Unchanged | Decorator is transparent |

## Interfaces / Contracts

```ts
export interface CacheConfig {
  readonly maxEntries: number;  // LRU cap, default 1000
  readonly ttlMs: number;       // 0 = no TTL, default 300_000
}

export class CachingUrlRepository implements UrlRepository {
  private readonly cache: LRUCache<string, string>; // code -> longUrl
  constructor(
    private readonly inner: UrlRepository,
    config: CacheConfig,
  ) {}
  // findByCode: cache-aside; others delegate to `inner`
}
```

Composition root wiring:

```ts
const base = deps.repository ?? new PrismaUrlRepository(getPrismaClient());
const repository = deps.repository
  ? base                    // tests inject a repo → no caching layer by default
  : new CachingUrlRepository(base, readCacheConfigFromEnv());
```

Note: when a test injects `deps.repository`, it bypasses caching for determinism. Cache-decorator tests construct `CachingUrlRepository` directly with a fake `inner` repo and explicit `CacheConfig`.

## Testing Strategy (Strict TDD, vitest)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Cache hit: 2nd `findByCode` returns same `longUrl`, `inner.findByCode` called ONCE | Spy/fake `inner` counting calls |
| Unit | Miss → populate → hit | Assert `inner` called once across two lookups |
| Unit | Miss returns `null` is NOT cached | Two misses → `inner` called twice |
| Unit | LRU eviction past `max` | `maxEntries: 2`, insert 3 codes, assert oldest re-fetches |
| Unit | TTL expiry forces re-fetch | `vi.useFakeTimers()` + `vi.advanceTimersByTime(ttl+1)` — NO real sleeps |
| Unit | Pass-through: `findByHash`/`existsByCode`/`create`/`incrementClicks`/`listAll` hit `inner` every call, never cached | Spy `inner`; call twice, assert 2 delegations |
| Unit | `incrementClicks` does not disturb a cached `findByCode` entry | Cache code, increment, `findByCode` still 1 `inner` call |
| Unit | Fallback: cache `get` throws → delegates to `inner`, redirect data still correct | Inject a cache stub that throws |

Determinism note: Slice 2 review flagged real-timer tests. TTL expiry MUST use `vi.useFakeTimers()`; `lru-cache` reads `Date.now()`, which fake timers control.

## Migration / Rollout

No migration required. Additive, isolated to the composition root. Rollback = remove the wrap (`repository = new PrismaUrlRepository(...)`), restoring direct DB access; no schema or data change.

## Scale-up path (NOT built)

A distributed cache (Redis) slots in as a *different* `UrlRepository` decorator (e.g. `RedisCachingUrlRepository`) swapped at the composition root — same port, same cache-aside shape, `get`/`set` become async network calls. Use cases and routes stay untouched. The `code -> longUrl`-only invariant carries over unchanged, so multi-instance staleness of counts remains impossible by construction.

## Open Questions

- None. All tradeoffs resolved by LOCKED #823.
