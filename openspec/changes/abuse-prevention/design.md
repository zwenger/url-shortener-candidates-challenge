# Design: Abuse Prevention & Security (Slice 4)

## Technical Approach

Three independent, additive controls placed by hexagonal layer: (1) SSRF host rejection as a **domain invariant** inside `LongUrl.create` (where the scheme allowlist already lives); (2) a per-IP token-bucket **rate limiter** and (3) **client-IP resolution** as web/infra-only modules invoked from the shorten `action`; (4) **security headers** applied app-wide via a new `entry.server.tsx`. The domain never imports web concerns; the web imports the domain. Honors all LOCKED decisions (#830): shorten-only limiting, socket IP unless `TRUST_PROXY`, static SSRF only, minimal CSP.

## Architecture Decisions

### Decision: SSRF check lives in the domain, static only
**Choice**: Add pure `isBlockedHost(hostname)` in `long-url.ts`; `normalize()` throws new `BlockedHostError` after the scheme check. Classify the parsed `hostname`: IPv4 literal → range test; IPv6 literal (strip `[]`) → range test; `localhost` / `*.localhost` → block; any other name → **pass** (no DNS).
**Alternatives**: resolve-time DNS check (rejected — deferred, adds async I/O to a pure VO); library like `ipaddr.js` (rejected — small hand-rolled matcher avoids a dep, matches Slice-1 "no new runtime deps" stance).
**Rationale**: Keeps the safety invariant co-located with existing validation and unit-testable without I/O. **Residual (documented): DNS rebinding** — a public name resolving to a private IP is NOT caught.

Blocked ranges: IPv4 `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `0.0.0.0/8`; IPv6 `::1`, `::`, `fc00::/7`, `fe80::/10`, plus IPv4-mapped `::ffff:` forms; names `localhost`.

### Decision: Rate limiter is web-layer, in-memory, injectable
**Choice**: `rate-limit.server.ts` exports a `createRateLimiter({ capacity, refillPerSec, now })` factory returning `take(key): boolean`. Backing store is an LRU/size-capped `Map<ip, { tokens, lastRefill }>` (cap ~10k, evict oldest) so it cannot grow unboundedly. Injectable `now` (clock) + config make tests deterministic with fake timers.
**Alternatives**: fixed-window (rejected — burst at boundaries); `lru-cache` dep (optional; a manual cap avoids the dep); global mutable singleton without injection (rejected — untestable).
**Rationale**: Token bucket smooths bursts; injection enables strict-TDD. **Residual**: resets on restart, not shared across instances → Redis is the multi-instance scale-up.

### Decision: Client IP via a custom Express server (real socket IP)
**Choice**: Replace `react-router-serve` with a small custom server (`applications/web/server.ts`) using `@react-router/express` `createRequestHandler({ build, getLoadContext(req, res) })`. `getLoadContext` reads Express's `req.ip` and passes it into the RR load context; the shorten `action` reads it from context to key the limiter. Express `trust proxy` is set from a `TRUST_PROXY` env flag: when set, `req.ip` honors `X-Forwarded-For`; otherwise it is the true socket IP (not spoofable). The web `start` script and the Dockerfile `CMD` change from `react-router-serve` to running the built custom server.
**Alternatives**: keep `react-router-serve` and key on `X-Forwarded-For`/degraded bucket (rejected — RR v7 loaders/actions receive a Fetch `Request` with no socket address, and `react-router-serve` does not surface it, so per-IP limiting would be spoofable/degraded without a trusted proxy — verified against RR v7 docs).
**Rationale**: A real per-socket IP makes the rate limiter genuinely effective standalone, not dependent on trusting a spoofable header. `getLoadContext` is the RR-sanctioned bridge for server→handler data. **Residual**: still not shared across instances (in-memory); DNS rebinding still applies to the SSRF check, not this.
**Note**: RR v7's load context is a `RouterContextProvider`; use the context mechanism matching the installed version.

### Decision: Security headers via entry.server.tsx
**Choice**: Create `entry.server.tsx` wrapping the default `handleRequest`; set headers on `responseHeaders` before returning so **every** document/redirect/error response carries them. Minimal CSP (redirect targets open in a new tab, never rendered inline).
**Alternatives**: per-route `headers` export (rejected — drift, misses error/redirect responses); reverse-proxy headers (rejected — not in app scope).

## Data Flow

    POST /  (shorten)
      action ─→ resolveClientIp(req) ─→ limiter.take(ip)
                                   false → 429
                                   true  ↓
                        LongUrl.create → BlockedHostError → 400
                                   ↓ ok
                        engine.shortenUrl → 200

    GET /s/:code (redirect)  → NOT rate-limited
    all responses ─→ entry.server handleRequest ─→ + security headers

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `libs/engine/src/domain/long-url.ts` | Modify | Call `isBlockedHost`; throw `BlockedHostError` |
| `libs/engine/src/domain/errors.ts` | Modify | Add `BlockedHostError extends DomainError` |
| `libs/engine/src/index.ts` | Modify | Export `BlockedHostError` |
| `applications/web/app/lib/rate-limit.server.ts` | Create | Token-bucket factory + client-IP-from-context helper |
| `applications/web/app/routes/_index.tsx` | Modify | Limiter gate (→429, IP from load context) + map `BlockedHostError`→400 |
| `applications/web/server.ts` | Create | Custom Express server: `createRequestHandler` + `getLoadContext` exposing `req.ip`; `trust proxy` gated by `TRUST_PROXY`; may set security headers via middleware |
| `applications/web/app/entry.server.tsx` | Create | (Alternative headers site) wrap `handleRequest` to add security headers — OR set them in the Express server; pick one in apply |
| `applications/web/package.json` | Modify | `start` script → run the built custom server (not `react-router-serve`); add `@react-router/express` + `express` deps |
| `Dockerfile` | Modify | `CMD`/entry runs the custom server instead of `react-router-serve` |

## Interfaces / Contracts

    // domain
    isBlockedHost(hostname: string): boolean   // pure, no DNS
    class BlockedHostError extends DomainError

    // web
    createRateLimiter(opts: { capacity: number; refillPerSec: number;
      now?: () => number; maxKeys?: number }): { take(key: string): boolean }
    resolveClientIp(request: Request): string

Headers: `Content-Security-Policy` (minimal), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (prod only). CSP uses `unsafe-inline` for styles (Tailwind/RR hydration); scripts kept default — nonce deferred (RR inline hydration script would otherwise break; documented tradeoff).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (domain) | Blocked-host matrix (each v4/v6 range + `localhost`) rejects; a public host passes | Parametrized `it.each` in `long-url.test.ts`, assert `BlockedHostError` |
| Unit (web) | allows N, blocks N+1, refills after window, per-IP isolation, eviction bound | `vi.useFakeTimers` + injected `now` |
| E2E (route) | 429 on Nth shorten; `BlockedHostError`→400; headers present | Extend `s.$code.e2e.test.ts` style calling `action`; assert `entry.server` header set |

## Migration / Rollout

No migration. Each control is independent; revert per-file per the proposal's rollback plan.

## Open Questions

- [ ] Resolved: client IP comes from a custom Express server via `getLoadContext(req.ip)` — no dependency on `react-router-serve`. Apply must verify the custom server serves the built app correctly in Docker (build output path, static assets) and that the e2e/dev flow still works.
