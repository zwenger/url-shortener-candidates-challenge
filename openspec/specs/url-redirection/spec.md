# URL Redirection Specification

## Purpose

Resolve a short code to its stored long URL and redirect the caller. Not-found codes MUST produce a typed error mapped to HTTP 404, not a bare or ambiguous response.

## Requirements

### Requirement: Resolve Code to Long URL via Repository

The system MUST look up a `ShortenedUrl` by its exact short code through the repository's find-by-code operation and, when found, redirect to the stored long URL exactly as persisted (no re-normalization of the stored value on read).

#### Scenario: Known code redirects to its stored URL

- GIVEN a `ShortenedUrl` record exists with code `"AbC1234"` and long URL `"https://example.com/a"`
- WHEN the resolve use case is called with `"AbC1234"`
- THEN the route redirects to `"https://example.com/a"`

### Requirement: Typed Not-Found Error for Unknown Codes

The system MUST throw a typed `UrlNotFoundError` when no record matches the requested code. The route boundary MUST map this error to HTTP 404 with a clear response, rather than the current bare `Response("Not Found", { status: 404 })` string.

#### Scenario: Unknown code yields a typed error internally

- GIVEN no `ShortenedUrl` record exists with code `"zzzzzzz"`
- WHEN the resolve use case is called with `"zzzzzzz"`
- THEN the use case throws `UrlNotFoundError` and does NOT redirect

#### Scenario: Unknown code yields HTTP 404 at the route

- GIVEN a request to `/s/zzzzzzz` where no matching record exists
- WHEN the redirect route loader runs
- THEN the response has status 404

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit tests (in `libs/engine`) MUST cover: found -> returns long URL, not-found -> throws `UrlNotFoundError`.
- The shorten -> redirect e2e-style test defined in the `url-shortening` spec covers the found-code redirect path end-to-end; a route-level case for the not-found path SHOULD also be covered (unit-level on the loader is sufficient; a full e2e case is not required beyond the shorten->redirect happy path already scoped for this slice).
