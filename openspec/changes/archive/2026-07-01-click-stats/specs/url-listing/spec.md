# URL Listing Specification

## Purpose

Provide a read model that returns every shortened URL together with its click statistics, so a future UI (Slice 5) can render a listing without additional domain logic.

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

### Requirement: Listing Is Exposed Only Through the Use Case

The system MUST expose URL statistics only via `ListUrlsUseCase` wired through `createEngine()`. The system MUST NOT add an HTTP route, loader, or JSON endpoint for listing in this slice.

#### Scenario: No listing route exists yet

- GIVEN this slice's scope
- WHEN the application routes are inspected
- THEN no `/urls` (or equivalent) HTTP route or loader is present

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit tests (`libs/engine`, using `InMemoryUrlRepository` fake) MUST cover: ordering by `createdAt` descending, empty-repository case, and a never-clicked entry showing `clickCount = 0` / `lastClickedAt = null`.
- No e2e coverage is required for this slice since no HTTP surface exists yet; the use case is verified at the unit level only.
