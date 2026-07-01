# Tasks: Core Domain + Persistence (Slice 1)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1150 (new domain/app/infra files, Prisma schema+migration, 2 rewritten routes, Docker/compose, tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (domain+app, in-memory only) → PR 2 (Prisma infra + persistence tests) → PR 3 (web wiring + Docker/compose + cleanup) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask user |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Domain + application layer, `InMemoryUrlRepository`, all unit tests green (no Prisma) | PR 1 | Independent; deletes `shortened-url.ts` |
| 2 | Prisma schema/migration, `PrismaUrlRepository` + integration test, composition root | PR 2 | Depends on PR 1's port/entities |
| 3 | Web wiring, route rewrites, e2e test, Dockerfile/compose, biome cleanup, final verification | PR 3 | Depends on PR 2's `createEngine()` |

For `feature-branch-chain`: PR 1 base = tracker/feature branch; PR 2 base = PR 1 branch; PR 3 base = PR 2 branch.

## Phase 1: Domain Layer (TDD)

- [x] 1.1 RED: `libs/engine/src/domain/long-url.test.ts` — normalization scenarios (lowercase scheme/host, strip default port, strip fragment, preserve non-default port, preserve path/query, reject malformed)
- [x] 1.2 GREEN: `libs/engine/src/domain/long-url.ts` — `LongUrl.create(raw)` using WHATWG `URL`, exposes `.value` (normalized) + `.hash` (SHA-256 via `node:crypto`); throws `InvalidUrlError`
- [x] 1.3 RED: `libs/engine/src/domain/short-code.test.ts` — base62 format guard (accepts `[A-Za-z0-9]+`, rejects empty/invalid chars)
- [x] 1.4 GREEN: `libs/engine/src/domain/short-code.ts` — `ShortCode.create(v)`
- [x] 1.5 `libs/engine/src/domain/errors.ts` — `DomainError`, `InvalidUrlError`, `UrlNotFoundError`, `CodeGenerationExhaustedError`
- [x] 1.6 `libs/engine/src/domain/shortened-url.ts` — `ShortenedUrl` entity (code, longUrl, urlHash, createdAt)
- [x] 1.7 `libs/engine/src/domain/url-repository.ts` — `UrlRepository` port interface (`findByHash`, `findByCode`, `existsByCode`, `create`)
- [x] 1.8 Delete `libs/engine/src/shortened-url.ts` (superseded by domain/*)

## Phase 2: Test Support

- [x] 2.1 `libs/engine/src/test-support/in-memory-url-repository.ts` — `InMemoryUrlRepository` implementing `UrlRepository` via `Map`, enforcing unique `code` and unique `urlHash` (throws on violation to mimic Prisma P2002 signal)

## Phase 3: Application Layer (TDD)

- [x] 3.1 RED: `libs/engine/src/application/short-code-generator.test.ts` — generates unique code on first try; retries transparently on single collision; throws `CodeGenerationExhaustedError` after 5 collisions
- [x] 3.2 GREEN: `libs/engine/src/application/short-code-generator.ts` — `ShortCodeGenerator` (base62 alphabet, `crypto.randomInt` per char, length from `SHORT_CODE_LENGTH` env, `maxAttempts = 5`)
- [x] 3.3 RED: `libs/engine/src/application/shorten-url.test.ts` — new URL persists+returns code; repeat URL (same/equivalent-normalized) returns existing code without new write; invalid URL throws `InvalidUrlError` before repo call
- [x] 3.4 GREEN: `libs/engine/src/application/shorten-url.ts` — `ShortenUrlUseCase` (normalize→hash→findByHash→generate-with-retry→create)
- [x] 3.5 RED: `libs/engine/src/application/resolve-url.test.ts` — known code returns stored long URL; unknown code throws `UrlNotFoundError`
- [x] 3.6 GREEN: `libs/engine/src/application/resolve-url.ts` — `ResolveUrlUseCase`

## Phase 4: Prisma Infrastructure

- [x] 4.1 `libs/engine/prisma/schema.prisma` — `Url` model (`code` unique, `urlHash` unique, `longUrl`, `createdAt`)
- [x] 4.2 Add `prisma`, `@prisma/client` to `libs/engine/package.json`; add `db:generate`/`db:migrate` scripts
- [x] 4.3 Run `prisma migrate dev` to generate initial migration under `libs/engine/prisma/migrations/`
- [x] 4.4 `libs/engine/src/infra/prisma-client.ts` — `PrismaClient` singleton
- [x] 4.5 RED: `libs/engine/src/infra/prisma-url-repository.integration.test.ts` — save/findByCode/findByHash against temp SQLite file; unique-constraint violation surfaces catchably
- [x] 4.6 GREEN: `libs/engine/src/infra/prisma-url-repository.ts` — `PrismaUrlRepository implements UrlRepository`, maps Prisma rows ↔ `ShortenedUrl`, lets P2002 propagate for use-case retry logic
- [x] 4.7 Integration test setup/teardown: run `prisma migrate deploy` against temp DB file before tests, delete file after
- [x] 4.8 `libs/engine/src/infra/composition-root.ts` — `createEngine(deps?)` factory wiring `PrismaUrlRepository` (default) or injected repo → `ShortCodeGenerator` + use cases
- [x] 4.9 `libs/engine/src/index.ts` — export `createEngine`, use-case types, `DomainError` subclasses; keep `baseUrl`; do NOT export `PrismaClient`/`PrismaUrlRepository`

## Phase 5: Web Wiring

- [x] 5.1 `applications/web/app/lib/engine.server.ts` — module-level `createEngine()` singleton
- [x] 5.2 Rewrite `applications/web/app/routes/_index.tsx` — Zod-validate submitted URL → `shortenUrl(raw)` → map `InvalidUrlError`→400, `CodeGenerationExhaustedError`→503
- [x] 5.3 Rewrite `applications/web/app/routes/s.$code.tsx` — `resolveUrl(code)` → redirect on hit, map `UrlNotFoundError`→404 (typed, not bare `Response`)
- [x] 5.4 RED then GREEN: `applications/web/app/routes/s.$code.e2e.test.ts` — POST shorten → follow code → assert redirect to original long URL (in-process, fake repo via `createEngine({ repository: new InMemoryUrlRepository() })`)

## Phase 6: Docker & Persistence

- [x] 6.1 `Dockerfile` — add `pnpm --filter @url-shortener/engine exec prisma generate` in build stage
- [x] 6.2 `Dockerfile` — copy generated Prisma client and `libs/engine/prisma/` into runtime stage (pnpm's isolated node_modules means the generated client lives under the copied `node_modules`/`libs/engine/node_modules` trees already — no separate `node_modules/.prisma` top-level path exists to copy)
- [x] 6.3 `Dockerfile` — add entrypoint step running `prisma migrate deploy` before `pnpm start`
- [x] 6.4 `docker-compose.yml` — named volume `url-shortener-data` mounted at `/app/data`; set `DATABASE_URL=file:/app/data/app.db`

## Phase 7: Cleanup

- [x] 7.1 `biome.jsonc` — remove the `overrides` block for `libs/engine/src/shortened-url.ts` (deleted) and the two now-clean route files
- [x] 7.2 Confirm no remaining imports of the deleted `libs/engine/src/shortened-url.ts` anywhere in the repo

## Phase 8: Final Verification

- [x] 8.1 `pnpm lint` — green across workspace
- [x] 8.2 `pnpm typecheck` — green across workspace
- [x] 8.3 `pnpm test` — all unit, integration, and e2e tests green (41 tests total)
- [x] 8.4 `pnpm build` — green
- [x] 8.5 `docker compose up` — app starts, migration runs on fresh volume, shorten+redirect works end-to-end (verified with real Docker build/run)
- [x] 8.6 Docker restart-survival check — shorten a URL, `docker compose down` (without `-v`), `docker compose up` again, confirmed the same code still resolves to the same long URL via the named volume (verified with real Docker; not a manual/assumed pass)
