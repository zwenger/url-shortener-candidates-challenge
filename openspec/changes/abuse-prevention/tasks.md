# Tasks: Abuse Prevention & Security (Slice 4)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (SSRF domain) -> PR 2 (custom server + rate limiter + wiring) -> PR 3 (security headers) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | SSRF static host denylist in domain (`isBlockedHost`, `BlockedHostError`) | PR 1 | Pure domain change, ~120-180 lines incl. parametrized tests. Independent, no server change. |
| 2 | Custom Express server + rate limiter + IP wiring into shorten action | PR 2 | Largest unit (~300-400 lines): `server.ts`, `rate-limit.server.ts`, package.json/Dockerfile CMD change, action wiring, tests. Depends on nothing from PR 1 but touches same action file as PR 3. |
| 3 | Security headers (entry.server.tsx or Express middleware) + header e2e tests | PR 3 | ~80-120 lines. Should land after PR 2 since it may live in `server.ts`. |

If `stacked-to-main`: PR 1 -> main, then PR 2 -> main, then PR 3 -> main, each independently reviewed/mergeable. If `feature-branch-chain`: PR 1 base = `slice-4-abuse-prevention` tracker branch, PR 2 base = PR 1 branch, PR 3 base = PR 2 branch, tracker merges to main last.

## Phase 1: SSRF Domain Invariant (TDD)

- [x] 1.1 RED: In `libs/engine/src/domain/long-url.test.ts`, add parametrized `it.each` blocked-host matrix (IPv4 `10.x`, `172.16.x`, `192.168.x`, `127.x`, `169.254.x`, `0.0.0.0/8`; IPv6 `::1`, `::`, `fc00::/7`, `fe80::/10`, IPv4-mapped `::ffff:...`; `localhost`) asserting `LongUrl.create` throws `BlockedHostError`; assert a public `https://example.com` URL still passes.
- [x] 1.2 GREEN: Add `BlockedHostError extends DomainError` to `libs/engine/src/domain/errors.ts`.
- [x] 1.3 GREEN: Add pure `isBlockedHost(hostname: string): boolean` in `libs/engine/src/domain/long-url.ts` (static IPv4/IPv6 range + `localhost` match, no DNS); call it in `normalize()` right after the scheme-allowlist check, throwing `BlockedHostError` on match.
- [x] 1.4 GREEN: Confirm existing scheme-allowlist test (`ftp://` -> `InvalidUrlError`) still passes unaffected.
- [x] 1.5 Export `BlockedHostError` from `libs/engine/src/index.ts`.
- [x] 1.6 REFACTOR: Extract IPv4/IPv6 range checks into small named helpers if `isBlockedHost` grows unwieldy; keep pure/no I/O.

## Phase 2: Rate Limiter (TDD, web layer)

- [x] 2.1 RED: Create `applications/web/app/lib/rate-limit.server.test.ts` using `vi.useFakeTimers()` and injected `now`: allows up to `capacity` requests, blocks the `capacity+1`th, refills a token after elapsed time, isolates buckets per key, and evicts the oldest entry once `maxKeys` is exceeded.
- [x] 2.2 GREEN: Implement `createRateLimiter({ capacity, refillPerSec, now, maxKeys })` in `applications/web/app/lib/rate-limit.server.ts` returning `{ take(key): boolean }`, backed by a size-capped `Map` (evict oldest key on overflow).
- [x] 2.3 REFACTOR: Ensure the limiter has no framework/Express dependency (pure TS) so it stays independently testable.

## Phase 3: Custom Express Server (client IP)

- [x] 3.1 Add `@react-router/express` and `express` to `applications/web/package.json` dependencies.
- [x] 3.2 Create `applications/web/server.ts`: build an Express app, set `app.set('trust proxy', ...)` gated by `TRUST_PROXY` env var, serve static assets from the RR build output, and mount `createRequestHandler({ build, getLoadContext(req, res) })` returning a load context that exposes `req.ip`.
- [x] 3.3 Verify the RR v7 build output path (`build/server/index.js`, `build/client`) and wire static-asset serving (`express.static`) plus the SPA/document handler correctly in `server.ts`.
- [x] 3.4 Update `applications/web/package.json` `start` script to run the compiled/executed custom server instead of `react-router-serve` (confirm whether `server.ts` needs a build step, e.g. via `tsx`/`esbuild`, or can run directly with Node's TS support — pick the simplest path consistent with the existing build script). DECISION: Node 24's native TypeScript support runs `server.ts` directly (no build step, no `tsx` dependency); relative imports only (no `~/` alias) since that resolution is a Vite-only feature.
- [x] 3.5 Update `Dockerfile` `CMD`/build steps so the production image runs the custom server (adjust `RUN pnpm build` step or add a server bundle step as needed); keep `docker-entrypoint.sh` migration step unchanged.

## Phase 4: Wire IP + Limiter + BlockedHostError into the Shorten Action

- [x] 4.1 RED: Extend `applications/web/app/routes/_index.tsx` tests (or new route test) asserting the 11th shorten request from the same IP within the window returns HTTP 429 and does not call `engine.shortenUrl`.
- [x] 4.2 RED: Add a test asserting a `BlockedHostError` thrown by `engine.shortenUrl` maps to HTTP 400 in the action.
- [x] 4.3 GREEN: In `_index.tsx` action, read the client IP from the RR load context (set by `server.ts`), call a module-level `limiter.take(ip)`; return `data({ error: ... }, { status: 429 })` (include `Retry-After` header if trivial) before invoking `engine.shortenUrl`.
- [x] 4.4 GREEN: Import `BlockedHostError` from `@url-shortener/engine` and map it to `data({ error: ... }, { status: 400 })` in the existing catch block, alongside `InvalidUrlError`.
- [x] 4.5 Instantiate the rate limiter once at module scope in `_index.tsx` (capacity ~10, refill matching ~10/min) so state persists across requests within the process.

## Phase 5: Security Headers

- [x] 5.1 RED: Add/extend `applications/web/app/routes/s.$code.e2e.test.ts` or a new headers test asserting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Content-Security-Policy` are present on both a successful shorten-page response and an error (400/429) response. DEVIATION: implemented as a dedicated unit test for the extracted `securityHeaders` Express middleware (`app/lib/security-headers.server.test.ts`) rather than a route-level test, since headers are applied in Express middleware (server.ts), not reachable from route-level `action`/`loader` unit tests. Full-stack confirmation (real HTTP, both success and 400/429 paths) done manually via curl against the running custom server — see apply-progress.
- [x] 5.2 GREEN: Implement the header set — either create `applications/web/app/entry.server.tsx` wrapping `handleRequest` to set `responseHeaders` before returning, OR add Express middleware in `applications/web/server.ts` that sets headers on every response. Pick ONE mechanism and document the choice in a code comment. DECISION: Express middleware in `server.ts` (extracted to `app/lib/security-headers.server.ts` for unit-testability), documented in-code.
- [x] 5.3 GREEN: Add `Strict-Transport-Security` conditionally (only when `NODE_ENV === "production"`).
- [x] 5.4 GREEN: Confirm CSP uses `unsafe-inline` for styles and does not block RR's inline hydration script (manual check: load the page in dev, no CSP console errors). Verified via curl against the built+running custom server: page loads with headers, hydration script (`entry.client`) is a same-origin `<script src>` module, not inline — style-src 'unsafe-inline' covers Tailwind's injected `<style>`.

## Phase 6: Cleanup & Verification

- [x] 6.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` at the repo root; fix any failures. All green: 137 tests (114 engine + 23 web), lint clean, typecheck clean, build clean.
- [x] 6.2 CRITICAL: `docker compose up --build` and manually verify: shorten -> redirect flow works end-to-end through the custom server; submitting an 11th shorten from the same client hits 429; a blocked-host URL returns 400; response headers are present; container restart preserves data (existing Slice-1 guarantee still holds). All verified live against the running container — see apply-progress for exact commands/output. Found and fixed a real gap during this manual pass: RR does not forward data()'s per-response `headers` option to the full-document response, so the 429's `Retry-After` header was silently dropped; added a `headers()` route export (TDD, new test) to fix it, re-verified live.
- [x] 6.3 Confirm the Node 24 + `prisma generate` Docker build flow is unaffected by the server change (build stage still runs `prisma generate` before `pnpm build`; production stage still copies the right artifacts, now including the server entry). Confirmed via a real `docker compose up --build`: prisma generate runs pre-build, migrations apply via the unchanged docker-entrypoint.sh, and the production image now also copies server.ts + app/lib + tsconfig.json alongside the build output.
- [x] 6.4 Update any relevant docs/comments referencing `react-router-serve` (README, Dockerfile comments) to reflect the custom server. No README or code comments referenced it; only design.md/tasks.md (historical planning records) mention it as the prior state, which is correct/expected.
