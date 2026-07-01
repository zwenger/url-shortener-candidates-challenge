# Tasks: Redirect Read-Path Caching (Slice 3)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200-280 (one new decorator file + one new test file + small composition-root/package.json edits) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full Slice 3 (dependency → decorator TDD → composition-root wiring → verification) | PR 1 | Additive-only, single new file (`caching-url-repository.ts`) + its test + a 3-line composition-root edit + one `package.json` dependency line; smaller in scope than Slice 2 |

## Phase 1: Dependency

- [x] 1.1 Modify `libs/engine/package.json`: add `"lru-cache"` to `dependencies` (LOCKED #823). Run `pnpm install` at the repo root to update the lockfile. Confirm this does NOT affect the Docker build's `dependencies` stage `postinstall: prisma generate` flow or turbo's `db:generate` task — `lru-cache` is a plain npm dependency with no native bindings, no Prisma schema involvement, and no generated client; it is fetched and installed exactly like `@prisma/client` is today, before `postinstall` runs.

## Phase 2: Interfaces & Config (Foundation)

- [x] 2.1 Create `libs/engine/src/infra/caching-url-repository.ts` (skeleton only, no logic yet): export `CacheConfig` interface (`maxEntries: number`, `ttlMs: number`) and the `CachingUrlRepository` class shell implementing `UrlRepository`, constructor `(inner: UrlRepository, config: CacheConfig)`, with a private `LRUCache<string, string>` field (code -> longUrl) constructed from `config`. Satisfies spec's "Decorator satisfies the UrlRepository contract" scenario once methods below are filled in.

## Phase 3: TDD — Pass-Through Operations (RED -> GREEN)

- [x] 3.1 RED: write `libs/engine/src/infra/caching-url-repository.test.ts` — set up a fake/spy `UrlRepository` (`inner`) with call counters per method. Add cases: `findByHash` delegates to `inner.findByHash` on every call (called twice for two calls, spec scenario "findByHash always delegates"); `existsByCode` delegates and returns `inner`'s result unchanged; `create` delegates with the same input and does not touch the cache; `listAll` delegates on every call and never caches (spec "listAll always hits the underlying repository").
- [x] 3.2 GREEN: implement `findByHash`, `existsByCode`, `create`, `listAll` on `CachingUrlRepository` as direct pass-through calls to `inner`. Run `pnpm test` in `libs/engine` — new pass-through cases green, no regressions.

## Phase 4: TDD — Cache-Aside on findByCode (RED -> GREEN)

- [x] 4.1 RED: extend `caching-url-repository.test.ts` — "cache miss populates from the underlying repository": empty cache + fake `inner` containing code `"AbC1234"` -> `longUrl "https://example.com/a"`; call `findByCode("AbC1234")`; assert `inner.findByCode` called exactly once AND returned `longUrl` equals `"https://example.com/a"`.
- [x] 4.2 RED: extend tests — "cache hit serves the correct longUrl without hitting the underlying repository": after the miss in 4.1, call `findByCode("AbC1234")` again; assert `inner.findByCode` call count is STILL 1 (not called again) AND `longUrl` still equals `"https://example.com/a"`.
- [x] 4.3 RED: extend tests — "cache hit returns sentinel count fields, never a real/stale count": on the cache-hit result from 4.2, assert `clickCount === -1`, `lastClickedAt === null`, `createdAt.getTime() === new Date(0).getTime()`, `urlHash === ""`. This is the core anti-staleness assertion from the design's sentinel-reconstruction decision (LOCKED #823) — a cache hit must never expose a plausible-looking real count.
- [x] 4.4 RED: extend tests — "unknown code is not cached as a false negative": fake `inner` has no record for `"zzzzzzz"`; call `findByCode("zzzzzzz")` twice; assert the decorator returns `null` both times AND `inner.findByCode` is called twice (a miss is never cached).
- [x] 4.5 GREEN: implement `findByCode` on `CachingUrlRepository`: on cache hit, reconstruct a minimal `ShortenedUrl` from the cached `longUrl` and the requested `code`, with sentinel fields `clickCount: -1`, `lastClickedAt: null`, `createdAt: new Date(0)`, `urlHash: ""`; on cache miss, call `inner.findByCode(code)`, and if the result is non-null, populate the cache with `result.longUrl` before returning the full result unchanged; if the result is `null`, return `null` without writing to the cache. Run `pnpm test` — 4.1 through 4.4 green.

## Phase 5: TDD — incrementClicks Passthrough + Cache Isolation (RED -> GREEN)

- [x] 5.1 RED: extend tests — "incrementClicks delegates and leaves the cache untouched": populate the `findByCode` cache for `"AbC1234"` (per 4.1 flow), call `incrementClicks("AbC1234")`, assert `inner.incrementClicks` called exactly once, then call `findByCode("AbC1234")` again and assert `inner.findByCode`'s call count is unchanged from before the `incrementClicks` call (still served from cache).
- [x] 5.2 GREEN: implement `incrementClicks` on `CachingUrlRepository` as a direct pass-through to `inner.incrementClicks`, with no cache read/write of any kind. Run `pnpm test` — 5.1 green, and confirm 4.x cases still pass (cache isolation intact).

## Phase 6: TDD — LRU Eviction (RED -> GREEN)

- [x] 6.1 RED: extend tests — "LRU evicts the least-recently-used entry beyond capacity": construct a `CachingUrlRepository` with `config.maxEntries = 2` and a fake `inner` containing codes `"A"`, `"B"`, `"C"`. Call `findByCode("A")` then `findByCode("B")` (both populate cache). Call `findByCode("C")` (third entry, capacity exceeded). Assert a subsequent `findByCode("A")` calls `inner.findByCode` again (evicted) while a subsequent `findByCode("B")` does NOT call `inner.findByCode` again (still cached, was more recently used than `"A"`).
- [x] 6.2 GREEN: confirm the `LRUCache` is constructed with `max: config.maxEntries` (already wired in 2.1); no additional eviction logic needed since `lru-cache` handles LRU semantics natively — this task is primarily verification that the constructor wiring from Phase 2 satisfies the eviction contract. Run `pnpm test` — 6.1 green.

## Phase 7: TDD — TTL Expiry (RED -> GREEN, fake timers)

- [x] 7.1 RED: extend tests — "TTL expiry forces a re-fetch": construct a `CachingUrlRepository` with `config.ttlMs` set to a small value (e.g. `1000`); call `vi.useFakeTimers()` BEFORE populating the cache. Populate `findByCode("AbC1234")` (one `inner` call). Call `vi.advanceTimersByTime(config.ttlMs + 1)`. Call `findByCode("AbC1234")` again; assert `inner.findByCode` is now called a SECOND time (TTL expired, cache repopulated). MUST use `vi.useFakeTimers()` / `vi.advanceTimersByTime` — real `setTimeout`/sleep-based tests are prohibited per the Slice 2 review finding on real-timer tests. Call `vi.useRealTimers()` in test teardown (`afterEach`) to avoid leaking fake timers into other test files.
- [x] 7.2 GREEN: confirm the `LRUCache` is constructed with `ttl: config.ttlMs` (already wired in 2.1). Run `pnpm test` — 7.1 green. If `lru-cache`'s default TTL behavior does not re-check on access (`updateAgeOnGet`), verify default config satisfies "expired entries are treated as absent on `get`" without extra options; adjust only if the RED test in 7.1 fails with default options.

## Phase 8: TDD — Graceful Fallback on Cache Error (RED -> GREEN)

- [x] 8.1 RED: extend tests — "cache read error falls back to the underlying repository": inject or stub the internal cache's `get` (and separately `set`) to throw for a given call; call `findByCode("AbC1234")` with a fake `inner` that resolves correctly; assert `inner.findByCode` is called AND the correct `longUrl` is still returned despite the cache throwing.
- [x] 8.2 GREEN: wrap the cache `get`/`set` calls inside `findByCode` in try/catch; on any thrown error from the cache, treat it as a miss and fall through to calling `inner.findByCode` directly, returning `inner`'s result without attempting to write to the (failing) cache again. Run `pnpm test` — 8.1 green, full suite for this file green.

## Phase 9: Composition Root Wiring

- [x] 9.1 Modify `libs/engine/src/infra/composition-root.ts`: when `deps.repository` is NOT injected, wrap the concrete `PrismaUrlRepository` with `new CachingUrlRepository(new PrismaUrlRepository(getPrismaClient()), cacheConfig)` before passing it to the use cases; when `deps.repository` IS injected (test/override path), use it directly with no caching layer, per the design's composition-root contract (`base = deps.repository ?? new PrismaUrlRepository(...)`; `repository = deps.repository ? base : new CachingUrlRepository(base, cacheConfig)`). Add a small `readCacheConfigFromEnv()` helper (inline or co-located) reading `CACHE_MAX_ENTRIES` (default `1000`) and `CACHE_TTL_MS` (default `300000`; `0` disables TTL) from `process.env`, parsed as integers with fallback to defaults on missing/invalid values.
- [x] 9.2 Verify (read-through, no new test required beyond existing composition-root coverage if any exists): `createEngine()` called with no `deps.repository` produces an engine backed by a `CachingUrlRepository` wrapping a `PrismaUrlRepository`, matching spec's "Composition root wires the decorator" scenario; `createEngine({ repository: fakeRepo })` in existing use-case tests remains uncached and behaviorally unchanged (regression check only — do not modify existing use-case test files).

## Phase 10: Cleanup & Verification

- [x] 10.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` at the repo root — all green, no regressions in `libs/engine` or `applications/web`.
- [x] 10.2 Confirm no new Prisma migration was generated and `libs/engine/prisma/schema.prisma` is untouched (this slice is additive-only at the infra/composition layer, no schema or data change per design's Migration/Rollout section). A full `docker compose up --build` smoke test is nice-to-have but NOT required for this slice, since there is no migration to verify against a fresh volume; if run, confirm the app still builds and a `/s/:code` redirect still works end-to-end with the cache wired in.
