# Abuse Prevention Specification

## Purpose

Protect the public shorten endpoint from cheap flooding and harden all HTTP responses with baseline security headers. This is a web-layer (inbound-HTTP) concern: per-IP rate limiting on the write path only, plus app-wide response headers. It does NOT cover SSRF/host validation (a domain concern specified under `url-shortening`).

## Requirements

### Requirement: Per-IP Rate Limit on the Shorten Path

The system MUST rate-limit the shorten action (`POST` on the shorten route) using a token-bucket algorithm keyed by client IP, refilling at a rate that permits approximately 10 requests per minute per IP. The system MUST NOT apply this limit to the redirect path (`/s/:code`). When a client exceeds its bucket, the system MUST respond with HTTP 429 and MUST NOT invoke the shorten use case for that request.

#### Scenario: Requests within the limit succeed

- GIVEN a client IP has made fewer than 10 shorten requests in the current window
- WHEN it submits another shorten request
- THEN the request is processed normally and the shorten use case is invoked

#### Scenario: The (N+1)th request in the window is rejected

- GIVEN a client IP has already made 10 shorten requests within the current token-bucket window
- WHEN it submits an 11th shorten request before the bucket refills
- THEN the response has HTTP status 429 and the shorten use case is NOT invoked

#### Scenario: The bucket refills over time

- GIVEN a client IP has exhausted its bucket
- WHEN sufficient time passes for the token-bucket to refill at least one token
- THEN a subsequent shorten request from that IP succeeds

#### Scenario: Different IPs are independent

- GIVEN client IP A has exhausted its rate-limit bucket
- WHEN client IP B (which has not exceeded its own bucket) submits a shorten request
- THEN IP B's request is processed normally, unaffected by IP A's state

#### Scenario: The redirect path is never rate-limited

- GIVEN a client IP has exhausted its shorten-path bucket
- WHEN it requests `GET /s/:code` for an existing code
- THEN the redirect is served normally with no 429, regardless of shorten-path bucket state

### Requirement: Client IP Resolution Honors an Explicit Trust Boundary

The system MUST derive the client IP from the underlying socket/remote address by default. The system MUST use the `X-Forwarded-For` header's client IP instead ONLY when an explicit `TRUST_PROXY` environment flag is set; otherwise the header MUST be ignored, even if present.

#### Scenario: Socket IP used by default

- GIVEN `TRUST_PROXY` is not set
- WHEN a request arrives with an `X-Forwarded-For` header set to an arbitrary value
- THEN the rate limiter keys the bucket on the socket/remote IP, not the header value

#### Scenario: X-Forwarded-For honored when trust is configured

- GIVEN `TRUST_PROXY` is set
- WHEN a request arrives with a valid `X-Forwarded-For` header
- THEN the rate limiter keys the bucket on the IP resolved from that header

### Requirement: Baseline Security Response Headers

The system MUST attach the following headers to every HTTP response served by the application: `X-Content-Type-Options: nosniff`, a frame-protection header (`X-Frame-Options` and/or a CSP `frame-ancestors` directive), a `Referrer-Policy`, and a minimal `Content-Security-Policy` that does not break React Router client-side hydration.

#### Scenario: Headers present on a normal page response

- GIVEN a client requests the shorten form page
- WHEN the server responds
- THEN the response includes `X-Content-Type-Options: nosniff`, a frame-protection header, `Referrer-Policy`, and `Content-Security-Policy`

#### Scenario: Headers present on error responses

- GIVEN a request that results in a 400 or 429 response
- WHEN the server responds
- THEN the same baseline security headers are present on that response too

#### Scenario: Hydration is not broken by CSP

- GIVEN the minimal CSP is applied
- WHEN the shorten page loads in a browser
- THEN React Router client-side hydration completes without CSP violations blocking required scripts

## Test Strategy (per Slice 0 Test Strategy Contract)

- Route/e2e tests MUST cover: the 11th shorten request within a window receives HTTP 429; the redirect path is unaffected after exhausting the shorten-path bucket; independent IPs are not cross-throttled; security headers are present on both success and error responses.
- Unit tests MUST cover the client-IP resolution helper: socket IP used when `TRUST_PROXY` is unset, `X-Forwarded-For` honored when set.

## Out of Scope

- Distributed/Redis-backed rate limiting (documented multi-instance scale-up).
- CAPTCHA, authentication, or account-based throttling.
- Click-count dedupe on the redirect path.
