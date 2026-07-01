# Delta for url-listing

## MODIFIED Requirements

### Requirement: Listing Is Exposed Through an HTTP Route

The system MUST expose URL statistics via a `/urls` HTTP route whose loader calls `listUrls()` (wired through `createEngine()`) and returns every entry with `code`, `longUrl`, `clickCount`, `lastClickedAt`, and `createdAt`, ordered `createdAt` descending. The system MUST render this data as a mobile-first card list (one card per URL), not a table. `Date` fields MUST serialize correctly across SSR (loader → client hydration) without throwing or rendering `Invalid Date`.
(Previously: listing was exposed only through `ListUrlsUseCase` with no HTTP route, and routes/loaders for listing were explicitly forbidden in this slice.)

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

## REMOVED Requirements

### Requirement: Listing Is Exposed Only Through the Use Case

(Reason: Slice 5 adds the `/urls` HTTP route and loader that Slice 2 deliberately deferred; the use-case-only constraint no longer holds.)
(Migration: See "Listing Is Exposed Through an HTTP Route" above — the use case itself is unchanged, only the previously-forbidden route now exists.)
