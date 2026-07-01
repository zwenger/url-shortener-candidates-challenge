# Design: Abuse Prevention & Security (Slice 4)

## Technical Approach

Three independent, additive controls placed by hexagonal layer: (1) SSRF host rejection as a **domain invariant** inside `LongUrl.create` (where the scheme allowlist already lives); (2) a per-IP token-bucket **rate limiter** and (3) **client-IP resolution** as web/infra-only modules invoked from the shorten `action`; (4) **security headers** applied app-wide via a new `entry.server.tsx`. The domain never imports web concerns; the web imports the domain. Honors all LOCKED decisions (#830): shorten-only limiting, socket IP unless `TRUST_PROXY`, static SSRF only, minimal CSP.

## Architecture Decisions

### Decision: SSRF check lives in the domain, static only, via `ipaddr.js`
**Choice**: Add pure `isBlockedHost(hostname)` in `long-url.ts`; `normalize()` throws new `BlockedHostError` after the scheme check. Strip a trailing dot; block `localhost` / `*.localhost` case-insensitively; classify IP literals (IPv4, or IPv6 with `[]` stripped) using `ipaddr.js`; any other name → **pass** (no DNS).
**Alternatives**: resolve-time DNS check (rejected — deferred, adds async I/O to a pure VO); hand-rolled range matcher (tried first, then rejected after adversarial review found it missed IPv6 address-embedding forms — NAT64/RFC6052, 6to4/RFC3056, SIIT/RFC6145 — that smuggle a blocked IPv4 address, e.g. the cloud metadata IP, inside an IPv6 literal, plus the IANA CGNAT/192.0.0.0/198.18.0.0 reserved ranges).
**Rationale**: Keeps the safety invariant co-located with existing validation and unit-testable without I/O; delegating range classification to a maintained library closes gaps a hand-rolled matcher is prone to miss. **Residual (documented): DNS rebinding** — a public name resolving to a private IP is NOT caught.

Blocked (via `ipaddr.js` ranges): IPv4 `private`, `loopback`, `linkLocal`, `carrierGradeNat`, `reserved` (incl. `192.0.0.0/24`, `198.18.0.0/15`), `unspecified`, `broadcast`; IPv6 `loopback`, `linkLocal`, `uniqueLocal`, `unspecified`, `reserved`; for IPv6 forms that embed an IPv4 address (`ipv4Mapped`, `rfc6052`/NAT64, `rfc6145`/SIIT, `6to4`), the embedded IPv4 is extracted and classified too; names `localhost` / `*.localhost` (trailing dot stripped first).

### Decision: Rate limiter is web-layer, in-memory, injectable
**Choice**: `rate-limit.server.ts` exports a `createRateLimiter({ capacity, refillPerSec, now })` factory returning `take(key): boolean`. Backing store is an LRU/size-capped `Map<ip, { tokens, lastRefill }>` (cap ~10k, evict oldest) so it cannot grow unboundedly. Injectable `now` (clock) + config make tests deterministic with fake timers.
**Alternatives**: fixed-window (rejected — burst at boundaries); `lru-cache` dep (optional; a manual cap avoids the dep); global mutable singleton without injection (rejected — untestable).
**Rationale**: Token bucket smooths bursts; injection enables strict-TDD. **Residual**: resets on restart, not shared across instances → Redis is the multi-instance scale-up.

### Decision: Client IP via a custom Express server (real socket IP)
**Choice**: Replace `react-router-serve` with a small custom server (`applications/web/server.ts`, exported as a `createApp(options)` factory) using `@react-router/express` `createRequestHandler({ build, getLoadContext(req, res) })`. `getLoadContext` reads Express's `req.ip` and the per-request CSP nonce (see below), and passes both into the RR `AppLoadContext`; the shorten `action` reads the IP from context (via the `clientIpFrom(context)` helper in `load-context.server.ts` — there is no `resolveClientIp(request)` function; `AppLoadContext` is a plain object, not a `RouterContextProvider`, since this project does not enable RR v8 middleware) to key the limiter. `TRUST_PROXY` is parsed (via `trust-proxy.server.ts`) into a numeric hop count or an explicit IP/CIDR list — **never** a bare boolean, which would trust every `X-Forwarded-For` hop and let a client spoof its own IP past the limiter; unset defaults to no trust (true socket IP). The web `start` script and the Dockerfile `CMD` run the custom server directly (`node server.ts`, not `pnpm start`, so Node is PID 1 and receives shutdown signals for graceful `server.close()`).
**Alternatives**: keep `react-router-serve` and key on `X-Forwarded-For`/degraded bucket (rejected — RR v7 loaders/actions receive a Fetch `Request` with no socket address, and `react-router-serve` does not surface it); a bare `TRUST_PROXY=true` boolean (rejected after adversarial review — trusts every proxy hop, spoofable).
**Rationale**: A real per-socket IP makes the rate limiter genuinely effective standalone, not dependent on trusting a spoofable header. `getLoadContext` is the RR-sanctioned bridge for server→handler data. **Residual**: still not shared across instances (in-memory); DNS rebinding still applies to the SSRF check, not this.

### Decision: Security headers via Express middleware, with a per-request CSP nonce
**Choice**: `securityHeaders` (an Express middleware in `security-headers.server.ts`, mounted first in `server.ts` so it applies to every response — documents, redirects, and thrown/error responses alike) sets the baseline headers and generates a random per-request nonce (`crypto.randomUUID()`), storing it on `res.locals.nonce` and including it in the CSP's `script-src 'self' 'nonce-<value>'`. `getLoadContext` forwards that nonce into `AppLoadContext.nonce`. The new `entry.server.tsx` (React Router's default SSR entry template did not exist in this repo until created here) reads `loadContext.nonce` and passes it to `<ServerRouter nonce>` and `renderToPipeableStream({ nonce })`. `root.tsx`'s root `loader` also returns the nonce so `Layout` can pass it to `<Scripts nonce>`, `<ScrollRestoration nonce>`, and `<Links nonce>` — React Router does not thread a nonce through a shared context automatically; each of these components requires the prop explicitly.
**Alternatives**: `entry.server.tsx`-only header setting (originally proposed; rejected — headers must also cover the static-asset and 404 paths that never reach RR's `handleRequest`, so Express middleware is the single point every response passes through); `default-src 'self'` with no `script-src` (the pre-fix state — **CRITICAL bug found by adversarial review**: this silently blocks all of React Router v7's inline hydration `<script>` tags — scroll restoration, `window.__reactRouterContext`, stream controllers — so the client never hydrates; the app still "works" via full-page form submits, masking the bug from a quick smoke test); `script-src 'unsafe-inline'` (rejected as the primary approach — weaker than a nonce — but documented as the fallback if nonce wiring had proven too fragile in RR v7, which it did not).
**Rationale**: A per-request nonce is materially stronger than `'unsafe-inline'` while still allowing RR's required inline scripts. Verified live via curl: every inline `<script nonce="X">` in the rendered HTML matches the `Content-Security-Policy: ... 'nonce-X'` header value for that same response.

## Data Flow

    POST /  (shorten)
      action ─→ clientIpFrom(context) ─→ { ip, failOpen }
                                   failOpen → skip limiter (log + bypass)
                                   else: limiter.take(ip)
                                     false → 429 (+ Retry-After, via headers() export)
                                     true  ↓
                        LongUrl.create → BlockedHostError → 400
                                   ↓ ok
                        engine.shortenUrl → 200

    GET /s/:code (redirect)  → NOT rate-limited (no limiter call in this route at all)

    every request ─→ securityHeaders Express middleware (mounted first in server.ts)
                        ─→ sets baseline headers + per-request CSP nonce on res.locals
                        ─→ getLoadContext forwards { clientIp, nonce } into AppLoadContext
                        ─→ entry.server.tsx renders <ServerRouter nonce> + passes nonce
                           to renderToPipeableStream; root.tsx's loader/Layout pass the
                           same nonce to <Scripts>/<ScrollRestoration>/<Links>

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `libs/engine/src/domain/long-url.ts` | Modify | Call `isBlockedHost` (via `ipaddr.js`); throw `BlockedHostError` |
| `libs/engine/src/domain/errors.ts` | Modify | Add `BlockedHostError extends DomainError` |
| `libs/engine/src/index.ts` | Modify | Export `BlockedHostError` |
| `libs/engine/package.json` | Modify | Add `ipaddr.js` dependency |
| `applications/web/app/lib/rate-limit.server.ts` | Create | Token-bucket factory |
| `applications/web/app/lib/load-context.server.ts` | Create | `AppLoadContext` augmentation (`clientIp`, `nonce`) + `clientIpFrom(context)` helper (fail-open, not a shared fallback key) |
| `applications/web/app/lib/security-headers.server.ts` | Create | Express middleware: baseline headers + per-request CSP nonce |
| `applications/web/app/lib/trust-proxy.server.ts` | Create | Parses `TRUST_PROXY` into a numeric hop count / IP-CIDR list, never a bare boolean |
| `applications/web/app/routes/_index.tsx` | Modify | Limiter gate (→429, IP from load context, fail-open on unresolved IP) + map `BlockedHostError`→400 + `SHORTEN_RATE_LIMIT` constant |
| `applications/web/server.ts` | Create | Custom Express server, exported as `createApp(options)`: `createRequestHandler` + `getLoadContext` exposing `req.ip`/nonce; `trust proxy` via `parseTrustProxy`; security headers middleware; graceful shutdown on SIGTERM/SIGINT |
| `applications/web/app/entry.server.tsx` | Create | Custom SSR entry (RR's default template did not exist in this repo); wires the per-request nonce into `<ServerRouter>`/`renderToPipeableStream` |
| `applications/web/app/root.tsx` | Modify | Root `loader` returns the nonce; `Layout` passes it to `<Scripts>`/`<ScrollRestoration>`/`<Links>` |
| `applications/web/package.json` | Modify | `start` script runs the built custom server (not `react-router-serve`); add `@react-router/express` + `express` deps |
| `Dockerfile` | Modify | `CMD ["node", "server.ts"]` (PID 1, graceful shutdown) instead of `react-router-serve`/`pnpm start`; `ENV NODE_ENV=production` |
| `pnpm-workspace.yaml` | Modify | `overrides.qs` pinned to a patched version (phantom vulnerable transitive via `@react-router/dev`'s optional peer `@react-router/serve`) |

## Interfaces / Contracts

    // domain
    isBlockedHost(hostname: string): boolean   // pure, no DNS, via ipaddr.js
    class BlockedHostError extends DomainError

    // web
    createRateLimiter(opts: { capacity: number; refillPerSec: number;
      now?: () => number; maxKeys?: number }): { take(key: string): boolean }
    clientIpFrom(context: unknown): { ip: string | undefined; failOpen: boolean }
    parseTrustProxy(value: string | undefined): number | string | boolean
    createApp(options?: CreateAppOptions): Express

There is no `resolveClientIp(request: Request)` function — the client IP is read from Express's `req.ip` inside `getLoadContext(req, res)` in `server.ts`, then read back out of `AppLoadContext` via `clientIpFrom(context)`.

Headers: `Content-Security-Policy` (with a per-request `script-src 'nonce-...'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (prod only). CSP uses `'unsafe-inline'` for styles only (Tailwind has no viable per-request nonce integration for its static stylesheet injection); scripts use the per-request nonce, not `'unsafe-inline'`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (domain) | Blocked-host matrix (each v4/v6 range, IPv6 IPv4-embedding forms, `localhost`, canonical-encoding regressions) rejects; a public host passes | Parametrized `it.each` in `long-url.test.ts`, assert `BlockedHostError` |
| Unit (web) | allows N, blocks N+1, refills after window, sub-window boundary, fractional accumulation, per-IP isolation, eviction bound | `vi.useFakeTimers` + injected `now` |
| Unit (web) | `clientIpFrom` fail-open behavior; `parseTrustProxy` never returns a bare boolean; `securityHeaders` nonce generation | Plain unit tests |
| Integration (web) | `createApp`: trust-proxy off/on honors/ignores `X-Forwarded-For`; `getLoadContext` surfaces IP + nonce; security headers present | `supertest` against `createApp()` with a stub request handler |
| E2E (route) | 429 on Nth shorten + `Retry-After`; `BlockedHostError`→400; fail-open bypasses the limiter; redirect path never rate-limited | Calling `action`/`loader` directly, `s.$code.e2e.test.ts` / `_index.abuse-prevention.e2e.test.ts` |
| Manual/Docker | CSP nonce matches emitted inline `<script>` tags; SSRF-blocked hosts incl. IPv6 embedding forms return 400; graceful shutdown | `curl` against the built server, `docker compose up --build` |

## Migration / Rollout

No migration. Each control is independent; revert per-file per the proposal's rollback plan.

## Open Questions

- [x] Resolved: client IP comes from a custom Express server via `getLoadContext(req.ip)` — no dependency on `react-router-serve`. Verified the custom server serves the built app correctly in Docker (build output path, static assets) and the e2e/dev flow.
- [x] Resolved (post-adversarial-review): the CSP needed a per-request nonce, not a static `script-src`, or React Router's inline hydration scripts would be silently blocked. Verified live via curl that the nonce in each inline `<script>` tag matches the `Content-Security-Policy` header.
