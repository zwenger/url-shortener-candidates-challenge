# URL Listing Specification

## Purpose

Provide a read model that returns every shortened URL together with its click statistics, exposed through both the `ListUrlsUseCase` domain API and an HTTP `/urls` route with loader for the UI to render a listing without additional domain logic.

## Requirements

### Requirement: ListUrlsUseCase Returns All URLs Ordered by Creation Date

The system MUST provide a `ListUrlsUseCase` that returns every persisted `ShortenedUrl`, each including `code`, `longUrl`, `clickCount`, `lastClickedAt`, and `createdAt`, ordered by `createdAt` descending (most recently created first). The system MUST NOT paginate or filter the result set in this slice.

#### Scenario: Listing returns all URLs newest first

- GIVEN three `ShortenedUrl` records were created in order A, then B, then C
- WHEN `ListUrlsUseCase` is invoked
- THEN the result is `[C, B, A]`
- AND each entry includes `code`, `longUrl`, `clickCount`, `lastClickedAt`, and `createdAt`

#### Scenario: Empty repository returns an empty list

- GIVEN no `ShortenedUrl` records exist
- WHEN `ListUrlsUseCase` is invoked
- THEN the result is an empty array

#### Scenario: A never-clicked URL is listed with default stats

- GIVEN a `ShortenedUrl` was created and never resolved via `/s/:code`
- WHEN `ListUrlsUseCase` is invoked
- THEN that entry's `clickCount` is `0`
- AND that entry's `lastClickedAt` is `null`

### Requirement: Listing Is Exposed Through an HTTP Route

The system MUST expose URL statistics via a `/urls` HTTP route whose loader calls `listUrls()` (wired through `createEngine()`) and returns every entry with `code`, `longUrl`, `clickCount`, `lastClickedAt`, and `createdAt`, ordered `createdAt` descending. The system MUST render this data as a mobile-first card list (one card per URL), not a table. `Date` fields MUST serialize correctly across SSR (loader → client hydration) without throwing or rendering `Invalid Date`.

#### Scenario: Loader returns all URLs newest first

- GIVEN three `ShortenedUrl` records were created in order A, then B, then C
- WHEN the `/urls` loader runs
- THEN the loader data is `[C, B, A]`
- AND each entry includes `code`, `longUrl`, `clickCount`, `lastClickedAt`, and `createdAt`

#### Scenario: Empty repository renders an empty state

- GIVEN no `ShortenedUrl` records exist
- WHEN the `/urls` loader runs
- THEN the loader returns an empty array
- AND the route renders an empty-state message instead of an empty card list

#### Scenario: A never-clicked URL is listed with default stats

- GIVEN a `ShortenedUrl` was created and never resolved via `/s/:code`
- WHEN the `/urls` loader runs
- THEN that entry's card shows `clickCount = 0`
- AND that entry's card shows no last-clicked value (e.g. "Never")

#### Scenario: Card list is mobile-first and responsive

- GIVEN the `/urls` route renders N entries
- WHEN viewed on a small (mobile) viewport
- THEN entries render as a single-column card list
- AND on larger viewports the layout MAY use additional columns without changing card content

#### Scenario: Date fields serialize correctly across SSR

- GIVEN the loader returns entries with `createdAt` and `lastClickedAt` as `Date` values from the repository
- WHEN the loader response is serialized to the client and hydrated
- THEN each date renders as a valid, human-readable value on both server-rendered HTML and post-hydration DOM
- AND no entry renders `Invalid Date` or throws during hydration

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit tests (`libs/engine`, using `InMemoryUrlRepository` fake) MUST cover: ordering by `createdAt` descending, empty-repository case, and a never-clicked entry showing `clickCount = 0` / `lastClickedAt = null`.
- Route-level tests (`applications/web`) MUST cover: `/urls` loader returns the expected list shape with correct ordering, stats, and date serialization; empty data renders an empty-state message; populated data renders one card per entry with visible code, destination, and click-count text.
