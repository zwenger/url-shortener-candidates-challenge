# Proposal: Abuse Prevention & Security (Slice 4)

## Intent

The challenge's **Security** requirement is "Implement measures to prevent abuse." Prior slices deliberately deferred the abuse/security hardening to here (Slice 1 review #810: host/private-IP SSRF denylist, rate limiting, security headers; Slice 2 #813: unbounded click counting is trivially inflatable). Today the public shorten endpoint is unmetered, `LongUrl.create` rejects bad schemes but happily accepts `http://169.254.169.254/` or `http://192.168.0.1/` (SSRF / internal-network probing via our redirect), and responses ship no security headers. This slice closes those gaps so a single client cannot cheaply flood the DB, coerce the server into fetching/redirecting to internal hosts, or exploit missing browser protections.

## Scope

### In Scope
- **Per-IP rate limit on the shorten action** (`_index.tsx`) — in-memory limiter at the WEB/route layer; Nth request in the window → HTTP 429. Client IP derived from a configurable trusted-proxy header (X-Forwarded-For) with socket-address fallback.
- **SSRF host hardening in the domain** — EXTEND URL validation (scheme allowlist already done) to reject `localhost` and literal private/loopback/link-local/metadata targets: `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`, unspecified. New typed `BlockedHostError` → HTTP 400.
- **Security response headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, minimal CSP, HSTS (prod). Applied app-wide via a server-level mechanism.
- **Strict TDD**: domain unit tests for blocked-host matrix (v4/v6/localhost + allowed public host passes); route/e2e tests for 429-after-N and headers-present.

### Out of Scope
- UI listing view + styling (Slice 5).
- Full resolve-time / DNS-based SSRF protection — documented follow-up (see DNS-rebinding risk).
- Distributed / Redis-backed rate limiting — documented multi-instance scale-up.
- CAPTCHA / auth / accounts — no auth model exists; noted as future work.
- Click-count dedupe (bots/prefetch) — revisit later; rate limiting is the primary abuse control this slice.

## Capabilities

### New Capabilities
- `abuse-prevention`: per-IP rate limiting on the write path and app-wide security response headers (web-layer inbound-HTTP concerns).

### Modified Capabilities
- `url-shortening`: input-validation requirement EXTENDED to reject private/loopback/link-local/metadata hosts (`BlockedHostError` → 400), as a domain invariant on top of the existing scheme allowlist.

## Approach

- **Rate limiter (web layer, not domain):** small in-memory fixed-window/token-bucket keyed by client IP, invoked in the shorten `action` before calling `engine.shortenUrl`; over-limit → `429`. Redirect path left unlimited by default (limiting it risks blocking legitimate traffic; revisit per open question). IP resolution isolated in a helper honoring a `TRUST_PROXY` config so header spoofing is a deliberate, documented trust boundary.
- **SSRF/host check (domain):** extend `long-url.ts` normalization with a `isBlockedHost()` predicate over the parsed hostname; throw `BlockedHostError`. Static string/IP inspection only — no DNS resolution (honest residual).
- **Security headers:** central server-level wrapper so every route response carries the headers, avoiding per-route drift.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `libs/engine/src/domain/long-url.ts` | Modified | Add private/loopback/link-local/metadata host rejection |
| `libs/engine/src/domain/errors.ts` | Modified | Add `BlockedHostError` (typed domain error) |
| `applications/web/app/routes/_index.tsx` | Modified | Rate-limit gate before shorten; map errors to 429/400 |
| `applications/web/app/lib/rate-limit.server.ts` | New | In-memory limiter + client-IP resolution helper |
| `applications/web/app/entry.server.tsx` | New | Server entry to attach security headers app-wide |
| `libs/engine` unit tests + `applications/web` e2e | New | Blocked-host matrix; 429-after-N; headers-present |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DNS rebinding: hostname resolving to a private IP bypasses static checks | Med | Documented residual; resolve-time SSRF is a stated follow-up |
| X-Forwarded-For spoofing when proxy untrusted | Med | Trust only via explicit `TRUST_PROXY` config; else socket IP |
| In-memory limiter resets on restart, not shared across instances | High | Acceptable for single-instance Docker; Redis noted as scale-up |
| False positives block legit users (shared NAT/office IP) | Med | Tune window/limit generously; 429 with retry guidance |
| Rate-limiting redirects could harm legit traffic | Med | Redirect path unlimited by default; behind open question |
| Overly strict CSP breaks the app serving user URLs / RR hydration | Med | Start minimal, test hydration; user-URLs open in new tab only |

## Rollback Plan

Each concern is independent and additive. Revert per-file: remove the header wrapper (`entry.server.tsx`), remove the limiter gate + delete `rate-limit.server.ts`, or revert `long-url.ts`/`errors.ts` to restore prior behavior. No schema or data migration involved — pure code revert.

## Dependencies

- Slices 1–3 merged (domain, click-stats, caching). No new runtime deps if the limiter is hand-rolled; a tiny limiter lib is optional.

## Success Criteria

- [ ] Shortening a URL whose host is private/loopback/link-local/metadata is rejected with a typed error → HTTP 400.
- [ ] Public-host URLs still shorten successfully (no regression).
- [ ] Exceeding the per-IP shorten limit in the window returns HTTP 429.
- [ ] All responses carry the agreed security headers (asserted in tests).
- [ ] Domain unit tests + route/e2e tests pass under strict TDD; CI green.
- [ ] Submission documents residual limits (DNS rebinding, in-memory limiter, no auth/CAPTCHA) transparently.
