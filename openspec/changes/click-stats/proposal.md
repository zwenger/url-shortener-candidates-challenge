# Proposal: Click Statistics Tracking (Slice 2)

## Intent

The challenge explicitly lists "Track click statistics" as a core service goal and requires a "View for listing URLs with statistics." Slice 1 delivers shorten + resolve/redirect but records nothing on visit. This slice adds click tracking to the domain and a read model, so each redirect records a click and Slice 5's UI has data to list. The redirect is the critical path and MUST NOT regress on the correctness or latency of recording a click.

## Scope

### In Scope
- Extend `ShortenedUrl` with `clickCount` (default 0) and `lastClickedAt` (nullable).
- Prisma migration adding both columns to existing `Url` table (safe defaults, no data loss).
- Extend `UrlRepository` port with `incrementClicks(code)`; implement in `PrismaUrlRepository` and `InMemoryUrlRepository` (contract parity — prior review finding).
- `RecordClickUseCase`, invoked from the `/s/:code` resolve path so each visit records a click.
- Resilience: recording MUST be best-effort — a failed/slow increment MUST NOT break or delay the redirect (swallow + log, non-blocking).
- Query use case (`ListUrlsUseCase`) returning `code, longUrl, clickCount, lastClickedAt, createdAt` for Slice 5.

### Out of Scope
- Caching / cache-invalidation on increment (Slice 3).
- Abuse prevention, rate limiting, bot/prefetch dedup, SSRF, security headers (Slice 4).
- Polished listing/stats UI + styling (Slice 5) — this slice exposes data via a use case only.
- Time-series analytics, per-referrer/geo breakdowns (documented as future work).

## Capabilities

### New Capabilities
- `click-tracking`: recording a click per redirect, best-effort and non-blocking; entity + port + `RecordClickUseCase`.
- `url-listing`: read model returning all URLs with their stats for the listing view.

### Modified Capabilities
- `url-shortening`: `ShortenedUrl` gains `clickCount` + `lastClickedAt`; `UrlRepository` port gains `incrementClicks`. (Slice 1 spec lives in `openspec/changes/core-domain-persistence/specs/`; treat as MODIFIED there.)

## Approach

Follow Slice 1 hexagonal patterns exactly. Domain: add fields to `ShortenedUrl`; add `incrementClicks(code): Promise<void>` to the `UrlRepository` port. Application: `RecordClickUseCase` (validates code via `ShortCode`, calls `incrementClicks`) and `ListUrlsUseCase` (calls new `repository.listAll()`). Infra: `PrismaUrlRepository` uses an atomic `update` with `{ clickCount: { increment: 1 }, lastClickedAt: now }`; migration via `prisma migrate`. Wire both use cases through `createEngine()` (`recordClick`, `listUrls`). The `/s/:code` loader resolves first, redirects, and records the click best-effort (awaited-but-guarded or fire-and-forget with catch+log) so the redirect never fails on a stats error.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `libs/engine/src/domain/shortened-url.ts` | Modified | Add `clickCount`, `lastClickedAt` |
| `libs/engine/src/domain/url-repository.ts` | Modified | Add `incrementClicks`, `listAll` |
| `libs/engine/src/application/record-click.ts` | New | `RecordClickUseCase` |
| `libs/engine/src/application/list-urls.ts` | New | `ListUrlsUseCase` |
| `libs/engine/src/infra/prisma-url-repository.ts` | Modified | Implement new port methods + map new fields |
| `libs/engine/src/test-support/in-memory-url-repository.ts` | Modified | Implement new methods (parity) |
| `libs/engine/src/infra/composition-root.ts` + `index.ts` | Modified | Expose `recordClick`, `listUrls` |
| `libs/engine/prisma/schema.prisma` + migration | Modified/New | Two new columns |
| `applications/web/app/routes/s.$code.tsx` | Modified | Record click best-effort on redirect |
| `libs/engine/**/*.test.ts`, `s.$code.e2e.test.ts` | New/Modified | Unit + integration + e2e |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Increment failure/latency breaks redirect | Med | Best-effort record: guard + log, never block or fail the redirect |
| Migration on existing DB with data | Med | Additive columns with `DEFAULT 0` / nullable; no backfill needed; `migrate deploy` on start |
| Count inflation from bots/prefetch/double GET | Med | Noted, kept simple this slice; dedup deferred to Slice 4 — document in submission |
| Listing without pagination degrades at scale | Low | Take-home scale is small; pagination flagged as an open question / future work |

## Rollback Plan

Revert the branch/PR. Schema rollback: the added columns are additive and unused by Slice 1 code paths, so reverting application code leaves harmless columns; a down-migration can drop `clickCount`/`lastClickedAt` if a clean schema is required. No destructive data change.

## Dependencies

- Slice 1 (`core-domain-persistence`) — DONE, merged to main. Uses its port, entity, `ShortCode`, `createEngine`, and `InMemoryUrlRepository` fake.

## Success Criteria

- [ ] Visiting `/s/:code` redirects AND increments `clickCount`, sets `lastClickedAt`.
- [ ] A failing/slow `incrementClicks` still yields a correct, timely redirect (proven by test).
- [ ] `ListUrlsUseCase` returns each URL's `code, longUrl, clickCount, lastClickedAt, createdAt`.
- [ ] `PrismaUrlRepository` and `InMemoryUrlRepository` implement identical port contract.
- [ ] Migration applies cleanly to an existing populated DB with no data loss.
- [ ] Strict TDD: unit tests (record + list via fake), integration test (`incrementClicks` on real SQLite), updated e2e (redirect increments count).

## Proposal question round

These are genuine product/technical tradeoffs. Answer, skip, or correct any:

1. **Counting policy** — count every GET on `/s/:code` (simplest, matches "clicks"), or attempt basic dedup now (e.g. ignore obvious HEAD/prefetch)? Recommendation: count every GET this slice; defer dedup to Slice 4. OK?
2. **Record timing** — record best-effort AFTER computing the redirect and never block it (fire-and-forget + catch/log), or await the increment before redirecting (accurate but adds DB latency + can fail the redirect)? Recommendation: best-effort, non-blocking. Agree?
3. **Pagination** — include basic pagination in `ListUrlsUseCase` now, or return all rows (ordered by `createdAt` desc) and defer pagination? Recommendation: defer for take-home scale; note as future work. OK?
4. **Data exposure for Slice 5** — expose stats only via the `ListUrlsUseCase` (Slice 5 builds its own loader), or also add a thin `/urls` loader/JSON endpoint now? Recommendation: use case only this slice. Agree?
5. **`lastClickedAt` semantics** — is "timestamp of the most recent click" the field Slice 5 needs, or do you also want `firstClickedAt` / nothing beyond `clickCount`? Recommendation: `clickCount` + `lastClickedAt` only.
