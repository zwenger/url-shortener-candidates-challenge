# Redirect Caching Specification

## Purpose

Reduce DB round-trips on the redirect hot path (`/s/:code`) by caching the
immutable `code -> longUrl` mapping in-process, via a decorator over
`UrlRepository`. The cache MUST be transparent to the domain/application layer
and MUST NOT allow mutable click statistics (`clickCount`, `lastClickedAt`) to
be served stale.

## Requirements

### Requirement: Transparent UrlRepository Decorator

The system MUST provide a `CachingUrlRepository` that implements the
`UrlRepository` port and wraps an underlying `UrlRepository` instance
(constructor-injected). It MUST be wired only at the composition root
(`createEngine()`), wrapping the Prisma repository. Use cases and routes MUST
depend only on `UrlRepository` and MUST NOT change.

#### Scenario: Decorator satisfies the UrlRepository contract

- GIVEN a `CachingUrlRepository` wrapping a fake underlying repository
- WHEN each `UrlRepository` method is called (`findByHash`, `findByCode`,
  `existsByCode`, `create`, `incrementClicks`, `listAll`)
- THEN each call returns a result with the same shape/type contract as the
  underlying repository would return directly

#### Scenario: Composition root wires the decorator

- GIVEN `createEngine()` is called without an explicit repository override
- WHEN the engine is constructed
- THEN the repository backing the use cases is a `CachingUrlRepository`
  wrapping a `PrismaUrlRepository`

### Requirement: Cache-Aside on findByCode

The system MUST cache only the immutable `code -> longUrl` mapping, keyed by
`code`, on `findByCode`. On a cache miss, it MUST fetch from the underlying
repository and populate the cache with the resolved `longUrl` before
returning. On a cache hit, it MUST NOT call the underlying repository's
`findByCode`. The cached entry MUST NOT be, or derive from, the mutable
`clickCount`/`lastClickedAt` fields — `findByCode` MAY re-read those fields
fresh from the underlying repository call when populating the cache, but a
cache hit MUST serve only `longUrl`-equivalent data sufficient for a correct
redirect.

#### Scenario: Cache miss populates from the underlying repository

- GIVEN an empty cache and a fake underlying repository containing code
  `"AbC1234"` -> `"https://example.com/a"`
- WHEN `findByCode("AbC1234")` is called on the `CachingUrlRepository`
- THEN the underlying repository's `findByCode` is called exactly once
- AND the returned `ShortenedUrl.longUrl` equals `"https://example.com/a"`

#### Scenario: Cache hit serves the correct longUrl without hitting the underlying repository

- GIVEN a prior `findByCode("AbC1234")` call already populated the cache
- WHEN `findByCode("AbC1234")` is called again
- THEN the underlying repository's `findByCode` is NOT called again
- AND the returned `longUrl` still equals `"https://example.com/a"`

#### Scenario: Unknown code is not cached as a false negative

- GIVEN the underlying repository has no record for code `"zzzzzzz"`
- WHEN `findByCode("zzzzzzz")` is called
- THEN the decorator returns `null`
- AND a subsequent call with the same code invokes the underlying repository
  again (a miss result is not cached)

### Requirement: Non-Cached Passthrough Operations

The system MUST delegate `findByHash`, `existsByCode`, `create`, and
`incrementClicks` directly to the underlying repository on every call,
without consulting or populating the `findByCode` cache. `incrementClicks`
MUST NOT invalidate, refresh, or otherwise touch the cache.

#### Scenario: findByHash always delegates

- GIVEN a `CachingUrlRepository` wrapping a fake underlying repository
- WHEN `findByHash(urlHash)` is called twice with the same hash
- THEN the underlying repository's `findByHash` is called exactly twice

#### Scenario: existsByCode always delegates

- GIVEN a `CachingUrlRepository` wrapping a fake underlying repository
- WHEN `existsByCode(code)` is called
- THEN the underlying repository's `existsByCode` is called and its result is
  returned unchanged

#### Scenario: create always delegates and does not require pre-invalidation

- GIVEN a code that does not yet exist in the cache or the underlying
  repository
- WHEN `create(input)` is called
- THEN the underlying repository's `create` is called with the same input
- AND no cache entry is required to be removed, since the new code was never
  cached

#### Scenario: incrementClicks delegates and leaves the cache untouched

- GIVEN a `findByCode` cache entry already exists for code `"AbC1234"`
- WHEN `incrementClicks("AbC1234")` is called
- THEN the underlying repository's `incrementClicks` is called exactly once
- AND a subsequent `findByCode("AbC1234")` still serves the cached `longUrl`
  without calling the underlying repository's `findByCode` again

### Requirement: listAll Is Never Cached

The system MUST always delegate `listAll` directly to the underlying
repository, on every call, so that `clickCount` and `lastClickedAt` are
always read fresh and authoritative.

#### Scenario: listAll always hits the underlying repository

- GIVEN a `CachingUrlRepository` wrapping a fake underlying repository
- WHEN `listAll()` is called multiple times in sequence
- THEN the underlying repository's `listAll` is called once per invocation
- AND the returned entities' `clickCount`/`lastClickedAt` reflect the
  underlying repository's current state each time

### Requirement: Bounded Cache with LRU Eviction

The system MUST bound the `findByCode` cache to a maximum of 1000 entries
using LRU eviction, implemented via the `lru-cache` library. When the cache
exceeds its capacity, the least-recently-used entry MUST be evicted first.

#### Scenario: LRU evicts the least-recently-used entry beyond capacity

- GIVEN a `CachingUrlRepository` configured with a max size of 2 entries
- AND `findByCode` has populated cache entries for codes `"A"` then `"B"`
- WHEN `findByCode("C")` is called, populating a third entry
- THEN the entry for `"A"` (least recently used) is evicted
- AND a subsequent `findByCode("A")` calls the underlying repository again
- AND a subsequent `findByCode("B")` still serves from cache

### Requirement: TTL-Bounded Staleness Safety Net

The system MUST expire cached `findByCode` entries after approximately 5
minutes (TTL), as a safety net against external target changes. After TTL
expiry, a lookup MUST be treated as a cache miss and re-fetch from the
underlying repository.

#### Scenario: TTL expiry forces a re-fetch

- GIVEN a `findByCode` cache entry for code `"AbC1234"` populated at time T
- AND the configured TTL has elapsed since T
- WHEN `findByCode("AbC1234")` is called after TTL expiry
- THEN the underlying repository's `findByCode` is called again
- AND the cache is repopulated with the (possibly updated) result

### Requirement: Graceful Fallback on Cache Failure

The system MUST NOT let a cache-layer failure break a redirect. If a read or
write to the in-process cache throws, the decorator MUST fall back to calling
the underlying repository directly and return its result.

#### Scenario: Cache read error falls back to the underlying repository

- GIVEN the in-process cache throws an error on read for code `"AbC1234"`
- WHEN `findByCode("AbC1234")` is called
- THEN the underlying repository's `findByCode` is called
- AND the correct `longUrl` is returned despite the cache error

## Test Strategy (per Slice 0 Test Strategy Contract)

- Strict TDD unit tests in `libs/engine` MUST cover, using a fake/spy
  underlying `UrlRepository`: cache hit (no delegate call), cache miss with
  populate (one delegate call), LRU eviction beyond capacity, TTL expiry
  forcing re-fetch, graceful fallback on cache error, and delegation-only
  behavior for `findByHash`, `existsByCode`, `create`, `incrementClicks`, and
  `listAll`.
- No integration test against a real DB or Redis is required; the decorator
  is verified against the `UrlRepository` port using fakes only.
