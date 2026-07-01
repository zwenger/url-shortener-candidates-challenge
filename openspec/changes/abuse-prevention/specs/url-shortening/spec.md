# Delta for URL Shortening

## ADDED Requirements

### Requirement: SSRF Hardening via Static Host/IP Denylist

The system MUST reject, at shorten time, any submitted URL whose hostname is `localhost` or a literal private, loopback, link-local, or metadata-service IP address, including but not limited to: IPv4 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`; and IPv6 `::1`, `fc00::/7`, `fe80::/10`, and the unspecified address `::`. This check MUST run as part of `LongUrl` creation, after scheme validation and before the URL is normalized/hashed for persistence. On a match, the system MUST throw a typed `BlockedHostError` and MUST NOT persist any record. The system MUST perform this check via static string/IP inspection of the parsed hostname only — it MUST NOT perform DNS resolution as part of this check.

This is an ADDED domain invariant layered on top of the existing scheme allowlist and normalization behavior (Requirement: Conservative URL Normalization), which is unchanged.

#### Scenario: Public host is accepted

- GIVEN a submitted string `"https://example.com/path"`
- WHEN `LongUrl.create` validates the input
- THEN validation passes and normalization/hashing proceeds as before

#### Scenario: Literal loopback IPv4 is rejected

- GIVEN a submitted string `"http://127.0.0.1/"`
- WHEN `LongUrl.create` validates the input
- THEN the system throws `BlockedHostError` and does NOT call the repository

#### Scenario: Literal private IPv4 ranges are rejected

- GIVEN submitted strings with hosts `"10.0.0.5"`, `"172.16.4.4"`, and `"192.168.0.1"`
- WHEN `LongUrl.create` validates each input
- THEN the system throws `BlockedHostError` for each, before persistence

#### Scenario: Link-local and metadata IPv4 are rejected

- GIVEN a submitted string `"http://169.254.169.254/"` (cloud metadata endpoint)
- WHEN `LongUrl.create` validates the input
- THEN the system throws `BlockedHostError` and does NOT call the repository

#### Scenario: Literal IPv6 loopback and unique-local ranges are rejected

- GIVEN submitted strings with hosts `"[::1]"`, `"[fc00::1]"`, `"[fe80::1]"`, and `"[::]"`
- WHEN `LongUrl.create` validates each input
- THEN the system throws `BlockedHostError` for each, before persistence

#### Scenario: The literal hostname "localhost" is rejected

- GIVEN a submitted string `"http://localhost:3000/"`
- WHEN `LongUrl.create` validates the input
- THEN the system throws `BlockedHostError` and does NOT call the repository

#### Scenario: Existing scheme allowlist behavior is preserved

- GIVEN a submitted string `"ftp://example.com/file"`
- WHEN `LongUrl.create` validates the input
- THEN the system throws `InvalidUrlError` (scheme rejection), unaffected by the new host check

#### Scenario: DNS-rebinding is a documented residual, not covered

- GIVEN a submitted string with a public-looking hostname that resolves (at request or redirect time) to a private IP via DNS
- WHEN `LongUrl.create` validates the input at shorten time
- THEN the system performs no DNS resolution and therefore does NOT detect this case — this is an accepted, documented residual risk, not a defect of this requirement

### Requirement: Typed Errors Mapped to HTTP at the Route Boundary

The system MUST map `InvalidUrlError` to HTTP 400, `BlockedHostError` to HTTP 400, and `CodeGenerationExhaustedError` to HTTP 503 (or another 5xx) at the route boundary, rather than letting raw exceptions or unhandled 500s reach the caller.
(Previously: this requirement mapped only `InvalidUrlError` to 400 and `CodeGenerationExhaustedError` to 5xx; `BlockedHostError` mapping is newly added.)

#### Scenario: Invalid URL yields HTTP 400

- GIVEN a request submits an unparseable URL
- WHEN the shorten route action runs
- THEN the response has status 400 and a meaningful error message

#### Scenario: Blocked host yields HTTP 400

- GIVEN a request submits a URL whose host is a private/loopback/link-local/metadata IP or `localhost`
- WHEN the shorten route action runs
- THEN the response has status 400 and a meaningful error message, and no record is persisted

#### Scenario: Exhausted code generation yields a 5xx, not a crash

- GIVEN the shorten use case throws `CodeGenerationExhaustedError`
- WHEN the shorten route action runs
- THEN the response has a 5xx status and does NOT expose an unhandled stack trace

## Test Strategy Addendum (per Slice 0 Test Strategy Contract)

- Unit tests (in `libs/engine`) MUST cover a blocked-host matrix: each IPv4 private/loopback/link-local/metadata range, each IPv6 private/loopback/link-local/unspecified case, and the literal string `localhost`, each asserting `BlockedHostError`. MUST also assert that a well-formed public `http`/`https` URL still succeeds (no regression).
- Route/e2e tests MUST cover: submitting a blocked-host URL to the shorten route returns HTTP 400 and does not create a record.
