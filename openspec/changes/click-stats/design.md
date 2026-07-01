# Design: Click Statistics Tracking (Slice 2)

## Technical Approach

Extend the Slice 1 light-hexagon (`libs/engine`) additively. NO change to the
`shorten`/`resolve` contracts. Domain grows two fields; the `UrlRepository` port
grows two methods (`incrementClicks`, `listAll`); two new application use cases
(`RecordClickUseCase`, `ListUrlsUseCase`) are wired through `createEngine()`
alongside the existing ones. The `/s/:code` loader keeps resolving+redirecting
exactly as today and records the click BEST-EFFORT after the redirect is
computed, so a stats failure can never break or delay the 302. Honors LOCKED
#813 (count every GET, non-blocking record, no pagination, use-case-only
exposure, `clickCount`+`lastClickedAt`, Prisma/InMemory parity).

## Architecture Decisions

| Decision | Alternatives rejected | Rationale |
|----------|-----------------------|-----------|
| **Best-effort record: compute redirect first, then `void engine.recordClick(code).catch(log)` — NOT awaited** | (a) `await` increment before redirect; (b) `await` inside try/catch then redirect | Awaiting adds DB round-trip latency to the critical path and couples redirect success to stats write health. Fire-and-forget with `.catch` guarantees the 302 returns at resolve speed and a failed/slow write is swallowed+logged. Loader still `await`s `resolveUrl` (needed for the target + 404); only the increment is detached. |
| **Add `clickCount`/`lastClickedAt` to `ShortenedUrl` as required fields; set in `toDomain`, `create` defaults, and fake `create`** | Optional fields (`?`) | Read model is total; Prisma columns have defaults so every row always has them. Keeping them required avoids `undefined` leaking to Slice 5. Existing callers (`shorten`/`resolve`) ignore them — no breakage. |
| **`incrementClicks(code): Promise<void>`; Prisma uses atomic `update({ data: { clickCount: { increment: 1 }, lastClickedAt: new Date() } })`** | Read-modify-write (`findByCode`→+1→update) | Atomic `increment` avoids lost-update races under concurrent GETs and is one round-trip. `void` return: caller is fire-and-forget, has no use for the row. |
| **`listAll(): Promise<ShortenedUrl[]>` on the port, ordered `createdAt desc` in the adapter** | New dedicated read-model type; SQL view | Reuse `ShortenedUrl` — it now carries every listing field. Ordering lives in the adapter (Prisma `orderBy`) and the fake (sort on read) so the contract is identical. |
| **`ListUrlsUseCase.execute()` returns `ShortenedUrl[]` verbatim (no mapping/pagination)** | Map to a trimmed DTO now | LOCKED: no pagination this slice. Entity already = the exact listing shape (`code,longUrl,clickCount,lastClickedAt,createdAt`). YAGNI on a DTO until Slice 5 needs a different shape. |
| **Additive Prisma migration: `clickCount Int @default(0)`, `lastClickedAt DateTime?`** | New table; backfill script | Additive nullable/defaulted columns apply to the existing populated SQLite volume with zero backfill and zero data loss; old rows read as count 0 / null. |

## Data Flow

    GET /s/:code (loader)
        │
        ├─ await engine.resolveUrl(code) ──► ResolveUrlUseCase ─► repo.findByCode
        │        (404 on miss — unchanged)
        │
        ├─ redirect = redirect(shortenedUrl.longUrl)   ◄── computed, ready to return
        │
        ├─ void engine.recordClick(code).catch(log)    ── detached, non-blocking
        │        └─► RecordClickUseCase ─► ShortCode.create(code) ─► repo.incrementClicks
        │                                    (atomic +1, lastClickedAt = now)
        └─ return redirect            ◄── 302 returns regardless of increment outcome

    (Slice 5) loader ─► engine.listUrls() ─► ListUrlsUseCase ─► repo.listAll() (createdAt desc)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `libs/engine/src/domain/shortened-url.ts` | Modify | Add `clickCount: number`, `lastClickedAt: Date \| null` |
| `libs/engine/src/domain/url-repository.ts` | Modify | Add `incrementClicks(code): Promise<void>`, `listAll(): Promise<ShortenedUrl[]>` |
| `libs/engine/src/application/record-click.ts` | Create | `RecordClickUseCase`: `ShortCode.create(code)` guard → `repo.incrementClicks` |
| `libs/engine/src/application/list-urls.ts` | Create | `ListUrlsUseCase`: returns `repo.listAll()` |
| `libs/engine/src/infra/prisma-url-repository.ts` | Modify | `toDomain` maps 2 fields; implement `incrementClicks` (atomic update), `listAll` (orderBy createdAt desc) |
| `libs/engine/src/test-support/in-memory-url-repository.ts` | Modify | `create` defaults count 0/null; implement `incrementClicks` (mutate stored record), `listAll` (sorted copy) |
| `libs/engine/src/infra/composition-root.ts` | Modify | Instantiate both use cases; add `recordClick`, `listUrls` to `Engine` + factory return |
| `libs/engine/src/index.ts` | Modify | (No new type export needed — `ShortenedUrl` already exported) |
| `libs/engine/prisma/schema.prisma` + migration | Modify/Create | Two additive columns; `prisma migrate dev` generates migration |
| `applications/web/app/routes/s.$code.tsx` | Modify | After computing redirect, `void engine.recordClick(code).catch(...)` then return |

## Interfaces / Contracts

```typescript
// domain/shortened-url.ts
export interface ShortenedUrl {
  readonly code: string;
  readonly longUrl: string;
  readonly urlHash: string;
  readonly clickCount: number;        // default 0
  readonly lastClickedAt: Date | null; // null until first click
  readonly createdAt: Date;
}

// domain/url-repository.ts (added to existing port)
incrementClicks(code: string): Promise<void>; // atomic +1, sets lastClickedAt=now
listAll(): Promise<ShortenedUrl[]>;            // all rows, createdAt desc

// infra/composition-root.ts (added to Engine)
recordClick: (code: string) => Promise<void>;
listUrls: () => Promise<ShortenedUrl[]>;
```

`incrementClicks` on a nonexistent code: Prisma `update` throws `P2025`; caught
by the loader's `.catch` (best-effort), so no user impact. `RecordClickUseCase`
validates the code shape via `ShortCode.create` before calling the repo, mirroring
`ResolveUrlUseCase`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `RecordClickUseCase` increments via fake; **failure-still-redirects** (fake `incrementClicks` rejects → loader still returns 302) | `createEngine({repository: fake})`; loader test with a fake whose `incrementClicks` throws — assert 302 returned + error logged, not thrown |
| Unit | `ListUrlsUseCase` returns rows ordered `createdAt desc`; count 0 / `lastClickedAt` null defaults on freshly created rows | Seed fake with staggered `createdAt`; assert order + defaults |
| Integration | `incrementClicks` + `listAll` against real temp SQLite (atomic +1, `lastClickedAt` set, ordering) | `PrismaUrlRepository` vs real DB, mirroring Slice 1 integration test |
| E2E | Redirect increments count | `s.$code.e2e.test.ts`: hit loader with fake repo, assert 302 AND `incrementClicks` observed for the code |

## Migration / Rollout

`prisma migrate dev --name add_click_stats` generates an additive migration
(`clickCount INTEGER NOT NULL DEFAULT 0`, `lastClickedAt DATETIME`). Applied on
container start by the existing `prisma migrate deploy` entrypoint (LOCKED #803).
Safe on the populated `/app/data/app.db` volume: no backfill, existing rows get
`0`/`NULL`, no data loss (verified). Note the SQLite provider does not emit a
literal `ALTER TABLE ADD COLUMN`: Prisma performs a RedefineTable (create
`new_Url`, `INSERT...SELECT` the existing columns, drop the old table, rename)
to add the new columns. The net effect is additive with zero backfill, but
because the mechanism is a full table rebuild rather than a single column add,
an interruption mid-migration on the shared volume is a heavier failure mode
than a simple `ALTER TABLE` would be. Rollback = revert PR; leftover columns
are harmless to Slice 1 paths, optional down-migration drops them.

## Open Questions

- [ ] Count inflation (bots/prefetch/double-GET) — DEFERRED to Slice 4 per LOCKED
  #813; documented as known limitation, out of scope here.
- [ ] Listing pagination — DEFERRED; `listAll` returns everything for take-home
  scale, flagged as future work.
