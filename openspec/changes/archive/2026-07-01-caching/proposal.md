# Proposal: Redirect Read-Path Caching (Slice 3)

## Intent

The redirect endpoint `/s/:code` is the read-heavy hot path — every visit resolves a code before redirecting, hitting the DB via `findByCode`. Reads dominate writes (one shorten, many redirects). Slice 1 left an explicit hook for this: a `CachingUrlRepository` decorator over the `UrlRepository` port. This slice adds an in-process cache-aside layer on the resolve path so repeat redirects avoid a DB round-trip, while staying invisible to the domain/application and never corrupting authoritative click stats.

## Scope

### In Scope
- `CachingUrlRepository` decorator implementing `UrlRepository`, wrapping the real (Prisma) repo; injected at `createEngine()` composition root so use cases are unchanged.
- Cache-aside on the redirect read path (`findByCode`): miss -> underlying repo -> populate; hit -> serve from cache.
- In-process bounded cache: max-size (LRU eviction) + TTL. Graceful — any cache miss/error falls back to the underlying repo; caching never breaks a redirect.
- Staleness safety (CRITICAL): the entity now carries mutable `clickCount`/`lastClickedAt` (Slice 2). Cache MUST NOT make authoritative counts wrong. `listAll` is NEVER cached (always fresh from DB). See Approach for what-to-cache decision.
- Invalidation policy for `incrementClicks` and `create`, documented and tested.
- Strict TDD unit tests using a fake underlying repo: hit, miss->populate, LRU eviction, TTL expiry, fallback-on-error, and the staleness/invalidation behavior.

### Out of Scope
- Abuse prevention / rate limiting / SSRF / security headers (Slice 4).
- Listing/stats UI (Slice 5); `listAll` stays uncached and authoritative.
- Distributed / Redis / multi-instance cache (documented as the scale-up path, not built).

## Capabilities

### New Capabilities
- `redirect-caching`: in-process cache-aside decorator on the redirect resolve path, bounded (LRU + TTL), with graceful DB fallback and stats-safe invalidation.

### Modified Capabilities
- None. The `UrlRepository` port and `ShortenedUrl` entity are unchanged; this is a transparent decorator wired only at the composition root. No spec-level behavior of `url-redirection`, `url-shortening`, or `url-listing` changes.

## Approach

Decorator over the port (Slice 1 hook), constructor-injected: `new CachingUrlRepository(new PrismaUrlRepository(...))` in `createEngine()`. Use cases keep depending on `UrlRepository` — zero domain/application change.

What to cache (staleness decision, to confirm): cache ONLY the immutable redirect target keyed by code (`code -> longUrl`), NOT the full mutable entity. The resolve path only needs `longUrl`; caching the whole entity would serve a stale `clickCount`. `findByCode` still returns a `ShortenedUrl`, but the cached value backs only the fields the redirect consumes; anything needing live counts (`listAll`) bypasses the cache entirely.

Pass-through (never cached): `findByHash`, `existsByCode` (shorten-time correctness), `listAll` (authoritative counts).

Invalidation:
- `create(code)`: the code did not exist, so nothing stale is cached — no invalidation strictly required; a defensive set/delete is cheap and documented.
- `incrementClicks(code)`: since only immutable `longUrl` is cached, an increment does NOT invalidate — the cached target is still correct, and counts are read from DB via `listAll`. This keeps the fire-and-forget click path free of cache coupling.

Bounded + graceful: LRU max-entries cap bounds memory; TTL bounds staleness if the target is ever externally changed. Any cache exception falls through to the underlying repo.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `libs/engine/src/infra/caching-url-repository.ts` | New | Decorator implementing `UrlRepository` |
| `libs/engine/src/infra/composition-root.ts` | Modified | Wrap Prisma repo with caching decorator |
| `libs/engine/src/infra/caching-url-repository.test.ts` | New | Unit tests (hit/miss/LRU/TTL/fallback/invalidation) |
| `libs/engine/package.json` | Maybe | Add `lru-cache` if chosen over hand-rolled Map+TTL |
| `libs/engine/src/domain/*`, `application/*`, routes | Unchanged | Decorator is transparent |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale `clickCount` served if full entity cached | High if mis-designed | Cache only immutable `longUrl`; `listAll` never cached |
| Cache/DB divergence on external target change | Low | TTL bounds staleness; single writer path in this app |
| Unbounded memory growth | Low | LRU max-entries cap |
| Invalidation bug couples fire-and-forget clicks to cache | Low | Increment does NOT touch cache (only immutable data cached) |
| Cache error breaks redirect | Low | Graceful fallback to underlying repo on any cache failure |

## Rollback Plan

Revert the branch/PR. The decorator is additive and isolated to the composition root; removing the wrap (`repository = new PrismaUrlRepository(...)`) restores direct DB access with no schema or data change.

## Dependencies

- Slice 1 (`core-domain-persistence`) — stable `UrlRepository` port + `createEngine`.
- Slice 2 (`click-stats`) — entity now carries mutable `clickCount`/`lastClickedAt`; this is the reason the what-to-cache decision matters.

## Success Criteria

- [ ] Repeat `/s/:code` redirects serve `longUrl` from cache (no repeat DB `findByCode`) — proven by test with a fake repo counting calls.
- [ ] Cache miss populates from the underlying repo and returns the correct URL.
- [ ] LRU evicts beyond max size; TTL expiry forces a re-fetch — both tested.
- [ ] Any cache error falls back to the underlying repo; redirect still succeeds.
- [ ] `listAll` always hits the underlying repo (never cached) — authoritative counts preserved.
- [ ] `incrementClicks` does not serve stale data on the redirect path (immutable-only cache) — tested.
- [ ] Use cases and routes are unchanged; only the composition root wires the decorator.

## Proposal question round

Genuine tradeoffs — answer, skip, or correct any:

1. **What to cache** — cache ONLY the immutable `code -> longUrl` (recommended: redirect-safe, no stale counts, no invalidation on click), or cache the whole `ShortenedUrl` entity and document `clickCount` as intentionally approximate (never authoritative; `listAll` stays the source of truth)? Recommendation: cache only `longUrl`.
2. **TTL length** — what staleness bound? A short TTL (e.g. 60s) is conservative; a long/none TTL maximizes hit rate but relies on invalidation. Since targets are immutable after `create` in this app, a long TTL (e.g. 5–10 min) or even no TTL (LRU-only) is defensible. Recommendation: modest TTL (~5 min) as a safety net.
3. **LRU max size** — bound on entries (memory cap). For take-home scale, e.g. 500–1000 entries. Recommendation: 1000. Acceptable?
4. **`incrementClicks` and the cache** — leave the cache untouched on increment (recommended, since only immutable `longUrl` is cached), or have it refresh/invalidate the entry? Recommendation: untouched — keeps the fire-and-forget click path decoupled.
5. **Library vs hand-rolled** — use `lru-cache` (battle-tested LRU+TTL, one small dep) or a hand-rolled `Map` + timestamp/TTL (zero deps, infra-light per the exploration)? Recommendation: `lru-cache` for correct eviction/TTL semantics with minimal test surface; hand-rolled acceptable if we want zero deps.
