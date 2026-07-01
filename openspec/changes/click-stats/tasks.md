# Tasks: Click Statistics Tracking (Slice 2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-420 (additive extension across 9 files + migration + tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full Slice 2 (domain → Prisma → app → wiring → tests) | PR 1 | Additive-only, no contract breakage; single reviewable unit similar in shape to Slice 1 but far smaller |

## Phase 1: Domain & Port (Foundation)

- [x] 1.1 Modify `libs/engine/src/domain/shortened-url.ts`: add `readonly clickCount: number` and `readonly lastClickedAt: Date | null` to `ShortenedUrl`.
- [x] 1.2 Modify `libs/engine/src/domain/url-repository.ts`: add `incrementClicks(code: string): Promise<void>` and `listAll(): Promise<ShortenedUrl[]>` to `UrlRepository`.

## Phase 2: Prisma Adapter & Migration

- [x] 2.1 Modify `libs/engine/prisma/schema.prisma`: add `clickCount Int @default(0)` and `lastClickedAt DateTime?` to `Url` model.
- [x] 2.2 Run `prisma migrate dev --name add_click_stats` to generate the additive migration SQL under `libs/engine/prisma/migrations/`.
- [x] 2.3 Modify `libs/engine/src/infra/prisma-url-repository.ts`: `toDomain` maps `clickCount`/`lastClickedAt`; implement `incrementClicks` via atomic `update({ data: { clickCount: { increment: 1 }, lastClickedAt: new Date() } })`; implement `listAll` via `findMany({ orderBy: { createdAt: "desc" } })` mapped through `toDomain`.

## Phase 3: Test-Support Parity

- [x] 3.1 Modify `libs/engine/src/test-support/in-memory-url-repository.ts`: `create` defaults new records to `clickCount: 0`, `lastClickedAt: null`.
- [x] 3.2 Implement `InMemoryUrlRepository.incrementClicks`: mutate the stored record's `clickCount` (+1) and `lastClickedAt` (`new Date()`). **DEVIATION from this line's original wording**: per updated review guidance (parity finding) and the url-shortening spec's "Prisma and in-memory adapters agree on incrementClicks" requirement, a missing code now THROWS a `RecordNotFoundError` shaped like Prisma's `P2025` (`{ code: "P2025" }`) instead of a silent no-op. This keeps Prisma/InMemory parity exact; documented inline in the fake's source.
- [x] 3.3 Implement `InMemoryUrlRepository.listAll`: return a sorted copy of all records ordered by `createdAt` descending (must not mutate internal storage order).

## Phase 4: Application Use Cases (TDD: red -> green)

- [x] 4.1 RED: write `libs/engine/src/application/record-click.test.ts` — successful increment calls `repository.incrementClicks(code)` with a valid `ShortCode`; a repository failure (including missing-record P2025) propagates to the caller (best-effort handling is the loader's responsibility, per design's `.catch(log)` data-flow); an invalid code does not call `incrementClicks`.
- [x] 4.2 GREEN: create `libs/engine/src/application/record-click.ts` — `RecordClickUseCase`: `ShortCode.create(code)` guard (swallow `InvalidShortCodeError` as a no-op, mirroring `ResolveUrlUseCase`'s pattern but without throwing `UrlNotFoundError`) -> `repository.incrementClicks(shortCode.value)`, NOT caught here (see deviation below).
- [x] 4.3 RED: write `libs/engine/src/application/list-urls.test.ts` — returns `[]` for an empty repository; returns records ordered `createdAt` desc for three staggered records; a never-clicked record has `clickCount: 0` / `lastClickedAt: null`.
- [x] 4.4 GREEN: create `libs/engine/src/application/list-urls.ts` — `ListUrlsUseCase.execute()` returns `repository.listAll()` verbatim (no mapping, no pagination).

## Phase 5: Composition Root Wiring

- [x] 5.1 Modify `libs/engine/src/infra/composition-root.ts`: instantiate `RecordClickUseCase` and `ListUrlsUseCase`; add `recordClick: (code: string) => Promise<void>` and `listUrls: () => Promise<ShortenedUrl[]>` to the `Engine` interface and the object returned by `createEngine()`. Do not touch `shortenUrl`/`resolveUrl` wiring.

## Phase 6: Web Loader Wiring

- [x] 6.1 Modify `applications/web/app/routes/s.$code.tsx`: after `redirect(shortenedUrl.longUrl)` is computed (but before returning it), call `void engine.recordClick(code).catch((error) => console.error(...))` — NOT awaited — then `return redirect(...)`. The `.catch` is load-bearing: a rejected `recordClick` must never throw into the loader.

## Phase 7: Tests — Unit

- [x] 7.1 In `record-click.test.ts` (from 4.1), coverage matches click-tracking spec scenarios "A failing increment still yields a successful redirect" (verified at the loader/e2e level — see 9.2) and "RecordClickUseCase Validates the Code Before Recording" (verified at the use-case level: invalid code never calls `incrementClicks`).
- [x] 7.2 In `list-urls.test.ts` (from 4.3), confirm coverage matches url-listing spec scenarios "Listing returns all URLs newest first", "Empty repository returns an empty list", "A never-clicked URL is listed with default stats".

## Phase 8: Tests — Integration

- [x] 8.1 Extend `libs/engine/src/infra/prisma-url-repository.integration.test.ts` against real temp SQLite: `incrementClicks` performs an atomic +1 and sets `lastClickedAt`; two sequential increments compound to `clickCount = 2`; `listAll` returns rows ordered `createdAt` descending; `incrementClicks` on a missing code throws a real Prisma `P2025` error (confirms the parity assumption against the actual Prisma runtime).

## Phase 9: Tests — E2E (loader)

- [x] 9.1 Extend `applications/web/app/routes/s.$code.e2e.test.ts`: a GET to `/s/:code` for an existing short URL returns a 302 redirect AND `incrementClicks` was called for that code.
- [x] 9.2 Add the **failure-still-redirects** e2e case: fake repository's `incrementClicks` rejects — loader STILL returns the 302, and the rejection is caught/logged (`console.error` spy asserted), not thrown.
- [x] 9.3 Both 9.1 and 9.2 flush microtasks (`await Promise.resolve()` x2) after receiving the loader's response and before asserting `incrementClicks`/`console.error` was called, avoiding a race with the detached `recordClick` promise.

## Phase 10: Cleanup & Verification

- [x] 10.1 Ran `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all green (see apply-progress for exact output: 80/80 tests passing, lint clean, typecheck clean, build succeeds for both packages).
- [ ] 10.2 BLOCKED — pre-existing Dockerfile bug (present on `main` before this slice, confirmed via `git stash` + rebuild on clean tree): the `dependencies` build stage runs `pnpm install --frozen-lockfile` before `libs/engine/prisma/schema.prisma` is copied into the image, so the `postinstall: prisma generate` script fails with "Could not find Prisma Schema". This blocks `docker compose up --build` for Slice 2 exactly as it would for Slice 1. Out of scope to silently fix in this slice — flagged as needs-manual-verification / needs a follow-up infra fix (likely: `COPY libs/engine/prisma ./libs/engine/prisma` added to the `dependencies` stage before `pnpm install`).
