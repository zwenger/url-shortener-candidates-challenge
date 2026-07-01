# Click Tracking Specification

## Purpose

Record one click each time a short code is resolved via `/s/:code`, without ever blocking or failing the redirect on a recording error.

## Requirements

### Requirement: Every Redirect Request Counts as One Click

The system MUST count every GET request to `/s/:code` that resolves to an existing `ShortenedUrl` as exactly one click. The system MUST NOT attempt to deduplicate bots, prefetch requests, or repeated GETs in this slice.

#### Scenario: A successful redirect increments the click count

- GIVEN a `ShortenedUrl` exists with code `"AbC1234"` and `clickCount = 0`
- WHEN a GET request to `/s/AbC1234` resolves successfully
- THEN `RecordClickUseCase` calls `incrementClicks("AbC1234")`
- AND the persisted `clickCount` becomes `1`
- AND `lastClickedAt` is set to the time of the request

#### Scenario: Repeated visits keep incrementing

- GIVEN `clickCount = 3` for code `"AbC1234"`
- WHEN two more GET requests resolve `"AbC1234"` successfully
- THEN `clickCount` becomes `5`
- AND `lastClickedAt` reflects the most recent of the two requests

#### Scenario: A URL never visited has no recorded clicks

- GIVEN a `ShortenedUrl` was created and never resolved
- WHEN its stored record is inspected
- THEN `clickCount` is `0`
- AND `lastClickedAt` is `null`

### Requirement: Click Recording Is Best-Effort and Non-Blocking

The system MUST record the click as a best-effort operation that never blocks or fails the redirect response. If `incrementClicks` fails or is slow, the system MUST log the failure and still return the redirect.

#### Scenario: A failing increment still yields a successful redirect

- GIVEN a `ShortenedUrl` exists with code `"AbC1234"`
- AND the repository's `incrementClicks` call will throw an error
- WHEN a GET request to `/s/AbC1234` is handled
- THEN the response is still a redirect to the stored long URL
- AND the error is logged
- AND no exception propagates to the caller

#### Scenario: Recording happens only after a successful resolve

- GIVEN no `ShortenedUrl` record exists for code `"zzzzzzz"`
- WHEN a GET request to `/s/zzzzzzz` is handled
- THEN the resolve use case throws `UrlNotFoundError`
- AND `incrementClicks` is NOT called for `"zzzzzzz"`

### Requirement: RecordClickUseCase Validates the Code Before Recording

`RecordClickUseCase` MUST validate the code through the same `ShortCode` value object used elsewhere before calling `incrementClicks`, so malformed codes are rejected consistently with the rest of the domain.

#### Scenario: A structurally invalid code is rejected without a repository call

- GIVEN a code string that fails `ShortCode` validation
- WHEN `RecordClickUseCase` is invoked with it
- THEN the use case does not call `incrementClicks`
- AND the invocation is treated as a no-op/logged failure, not a thrown error that blocks the redirect

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit tests (`libs/engine`, using `InMemoryUrlRepository` fake) MUST cover: successful increment updates `clickCount`/`lastClickedAt`, a throwing repository does not propagate, and an invalid code does not call the repository.
- Integration test (`libs/engine`) MUST cover `PrismaUrlRepository.incrementClicks` against a real SQLite test database: increment persists `clickCount` and `lastClickedAt` correctly across repeated calls.
- E2E test (`applications/web`) MUST cover: a GET to `/s/:code` for an existing short URL results in a redirect AND the underlying `clickCount` is incremented by 1.
