# URL Shortening Specification

## Purpose

Shorten a validated long URL into a unique base62 short code. Shortening MUST be idempotent by normalized URL and collision-safe against the code space.

## Requirements

### Requirement: Input Validation at the Boundary

The system MUST validate the submitted URL with a Zod schema before invoking the shorten use case. The system MUST reject malformed or non-HTTP(S)-parseable input with a typed `InvalidUrlError` before any persistence attempt.

#### Scenario: Well-formed URL is accepted

- GIVEN a submitted string `"https://example.com/path?q=1"`
- WHEN the shorten use case validates the input
- THEN validation passes and the use case proceeds to normalization

#### Scenario: Malformed URL is rejected

- GIVEN a submitted string `"not a url"`
- WHEN the shorten use case validates the input
- THEN the system throws `InvalidUrlError` and does NOT call the repository

### Requirement: Conservative URL Normalization

The system MUST normalize the URL before computing its dedup hash: lowercase the scheme and host, strip the default port for the scheme (80 for http, 443 for https), and strip the fragment (`#...`). The system MUST preserve path and query exactly as submitted (no trailing-slash stripping, no query-param sorting, no `www.` removal).

#### Scenario: Scheme and host are lowercased, default port stripped

- GIVEN the input `"HTTPS://Example.COM:443/Path?x=1"`
- WHEN the URL is normalized
- THEN the normalized form is `"https://example.com/Path?x=1"`

#### Scenario: Fragment is stripped, path and query preserved

- GIVEN the input `"https://example.com/Path?x=1#section"`
- WHEN the URL is normalized
- THEN the normalized form is `"https://example.com/Path?x=1"`

#### Scenario: Non-default port is preserved

- GIVEN the input `"https://example.com:8443/a"`
- WHEN the URL is normalized
- THEN the normalized form retains `:8443`

### Requirement: Idempotent Shortening by Normalized-URL Hash

The system MUST compute a SHA-256 hash of the normalized URL and use it to look up an existing `ShortenedUrl` via the repository's find-by-hash operation. If a matching record exists, the system MUST return its existing short code without generating a new one or writing a new record.

#### Scenario: Same URL submitted twice returns the same code

- GIVEN a URL `"https://example.com/a"` was already shortened and stored with code `"AbC1234"`
- WHEN the same URL (or one that normalizes identically) is submitted again
- THEN the use case returns code `"AbC1234"` and does NOT create a new record

#### Scenario: URLs that normalize identically are treated as duplicates

- GIVEN `"https://EXAMPLE.com:443/a"` was already shortened
- WHEN `"https://example.com/a"` is submitted
- THEN the use case returns the existing code because both normalize to the same value

### Requirement: Base62 Code Generation with Bounded Retry

When no existing record matches the URL hash, the system MUST generate a short code from the base62 alphabet (`[A-Za-z0-9]`) at a configurable length (default 7 characters, overridable via environment variable). The system MUST enforce uniqueness via a database unique constraint on the code column and MUST retry generation a bounded number of times on collision. If all retries collide, the system MUST throw `CodeGenerationExhaustedError` instead of looping indefinitely or silently overwriting an existing record.

#### Scenario: New URL gets a fresh unique code

- GIVEN no existing record matches the normalized URL's hash
- WHEN the shorten use case runs
- THEN a new base62 code of the configured length is generated, persisted with the URL and its hash, and returned

#### Scenario: A single collision is retried transparently

- GIVEN the first generated code already exists in the repository
- WHEN the use case attempts to save
- THEN the use case regenerates a code and retries, succeeding on a subsequent attempt without surfacing an error to the caller

#### Scenario: Retry exhaustion raises a typed error

- GIVEN every generation attempt up to the bounded retry limit collides with an existing code
- WHEN the use case exhausts all retries
- THEN the system throws `CodeGenerationExhaustedError` and does NOT persist a record

### Requirement: Typed Errors Mapped to HTTP at the Route Boundary

The system MUST map `InvalidUrlError` to HTTP 400 and `CodeGenerationExhaustedError` to HTTP 503 (or another 5xx) at the route boundary, rather than letting raw exceptions or unhandled 500s reach the caller.

#### Scenario: Invalid URL yields HTTP 400

- GIVEN a request submits an unparseable URL
- WHEN the shorten route action runs
- THEN the response has status 400 and a meaningful error message

#### Scenario: Exhausted code generation yields a 5xx, not a crash

- GIVEN the shorten use case throws `CodeGenerationExhaustedError`
- WHEN the shorten route action runs
- THEN the response has a 5xx status and does NOT expose an unhandled stack trace

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit tests (in `libs/engine`) MUST cover: normalization edge cases, idempotent repeat-shorten, invalid URL rejection, single-collision retry success, and retry-exhaustion raising `CodeGenerationExhaustedError`.
- One route-level e2e-style test (in `applications/web`, using the Slice 0 Vitest route-aware infra) MUST cover: POST shorten -> follow generated code -> assert redirect to the original long URL. This is the first real e2e case per the Slice 0 contract.
