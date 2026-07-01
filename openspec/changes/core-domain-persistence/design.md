# Design: Core Domain + Persistence (Slice 1)

## Technical Approach

Restructure `libs/engine` into a **light hexagonal** layout: `domain/` (entities, value objects, typed errors, the `UrlRepository` port), `application/` (use cases + `ShortCodeGenerator` service), `infra/` (Prisma adapter, client singleton, Prisma schema). Dependency rule: `domain` imports nothing; `application` imports `domain` only; `infra` imports `domain` (+ Prisma) only. The web app wires the adapter to use cases through a single **composition root** and reduces both routes to thin adapters (Zod-validate → call use case → map typed errors to HTTP). Honors all LOCKED decisions (#803): SHA-256 `urlHash` unique index, conservative normalization, base62 len-7 env-configurable, bounded retry + `CodeGenerationExhaustedError`, Prisma/SQLite at `/app/data/app.db`, `migrate deploy` on start.

## Module Structure & Import Boundaries

```
libs/engine/src/
  domain/
    shortened-url.ts        ShortenedUrl entity
    long-url.ts             LongUrl VO (validate + normalize + hash)
    short-code.ts           ShortCode VO (base62 format guard)
    errors.ts               DomainError hierarchy
    url-repository.ts       UrlRepository PORT (interface only)
  application/
    short-code-generator.ts ShortCodeGenerator (base62 + retry loop)
    shorten-url.ts          ShortenUrlUseCase (find-or-create)
    resolve-url.ts          ResolveUrlUseCase
  infra/
    prisma-client.ts        PrismaClient singleton
    prisma-url-repository.ts PrismaUrlRepository (implements port)
    composition-root.ts     createEngine(): factory wiring adapter→use cases
  index.ts                  public API barrel
  prisma/schema.prisma      Url model + migrations/

import direction (never reversed):
  infra ──▶ domain ◀── application
    │                      │
    └──▶ application ◀─────┘   (composition-root only)
```

`index.ts` exports: `createEngine`, use-case *types*, and the `DomainError` classes (routes need them for `instanceof` mapping). It does NOT export `PrismaClient` or the concrete repository.

**Composition root**: `createEngine(deps?)` in `infra/composition-root.ts` builds `PrismaUrlRepository(prisma)`, injects it into `ShortCodeGenerator` + use cases, returns `{ shortenUrl, resolveUrl }`. The web app calls `createEngine()` once in a server-only module (`app/lib/engine.server.ts`) and imports that singleton from both routes. Tests call `createEngine({ repository: new InMemoryUrlRepository() })` to bypass Prisma entirely.

## Architecture Decisions

### Decision: Composition root as a factory in infra (not DI container, not per-route wiring)
| Option | Tradeoff | Decision |
|--------|----------|----------|
| DI framework (tsyringe/inversify) | Decorators + metadata reflection; overkill for 2 use cases | Rejected |
| Wire adapter inside each route | No shared instance; Prisma client re-created per module; duplication | Rejected |
| `createEngine()` factory + optional deps | Manual wiring, but explicit, zero-dep, testable via injection | **Chosen** |
**Rationale**: Constructor injection through one factory keeps the domain infra-free and lets tests swap the repository. The factory lives in `infra` because it's the only layer allowed to know both the port and the concrete adapter — that IS the composition root's job.

### Decision: Value Objects own validation + normalization + hashing
**Choice**: `LongUrl.create(raw)` validates (WHATWG `URL`), normalizes (lowercase scheme+host, strip default port + fragment, preserve path/query), and exposes `.value` + `.hash` (SHA-256 of normalized via `node:crypto`). `ShortCode.create(v)` guards base62 format.
**Alternatives**: normalize in the use case (rejected — leaks domain rules into orchestration, un-unit-testable in isolation); Zod-only at route (rejected — Zod guards *shape* at the boundary, but the *domain invariant* must hold regardless of caller). **Rationale**: constructing an invalid VO is impossible → validation is centralized and unit-tested without any infra. Zod at the route is the outer guard; the VO is the inner invariant (defense in depth).

### Decision: Idempotency + retry live in the use case, backed by DB constraints
**Choice**: `ShortenUrlUseCase` = normalize→hash→`findByHash` (return existing code if hit) → else generate code with bounded retry → `create`. The DB `urlHash` UNIQUE and `code` UNIQUE constraints are the source of truth; a `create` that races throws Prisma `P2002`, caught and mapped (re-fetch by hash on hash-collision; retry on code-collision).
**Alternatives**: cache-check only in memory (rejected — not durable, races across requests); `upsert` (rejected — obscures the collision signal we need for retry accounting). **Rationale**: constraint-backed idempotency is correct under concurrency; the in-code find-first is the fast path, the constraint is the safety net.

## Data Flow

```
shorten:  Route(action) ─Zod─▶ shortenUrl(raw)
            LongUrl.create(raw) ─▶ normalize+hash
            repo.findByHash(hash) ── hit ─▶ return existing ShortenedUrl
                   │ miss
                   ▼
            generator.generate(): loop ≤5 { ShortCode + repo.existsByCode? }
                   ▼ exhausted → CodeGenerationExhaustedError
            repo.create({code, longUrl, urlHash}) ─(P2002 code)▶ retry
                   ▼
            ShortenedUrl ─▶ route builds `${PUBLIC_URL}/s/${code}`

resolve:  Route(loader) ─Zod(code)─▶ resolveUrl(code)
            repo.findByCode(code) ── null ─▶ UrlNotFoundError → 404
                   ▼ redirect(longUrl)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `libs/engine/src/shortened-url.ts` | Delete | Map + broken code-gen removed |
| `libs/engine/src/domain/{shortened-url,long-url,short-code,errors,url-repository}.ts` | Create | Entity, VOs, error hierarchy, port |
| `libs/engine/src/application/{short-code-generator,shorten-url,resolve-url}.ts` | Create | Generator + use cases |
| `libs/engine/src/infra/{prisma-client,prisma-url-repository,composition-root}.ts` | Create | Client singleton, adapter, factory |
| `libs/engine/src/index.ts` | Modify | New public API (keep `baseUrl`) |
| `libs/engine/prisma/schema.prisma` + `migrations/` | Create | `Url` model + initial migration |
| `libs/engine/package.json` | Modify | Add `prisma`, `@prisma/client`; `postinstall`/`db:*` scripts |
| `applications/web/app/lib/engine.server.ts` | Create | `createEngine()` singleton import |
| `applications/web/app/routes/_index.tsx` | Modify | Zod + shortenUrl + error mapping |
| `applications/web/app/routes/s.$code.tsx` | Modify | resolveUrl + typed 404 |
| `Dockerfile` | Modify | `prisma generate` in build; ship client + `prisma/`; entrypoint runs `migrate deploy` |
| `docker-compose.yml` | Modify | Named volume `url-shortener-data`→`/app/data`; `DATABASE_URL` |
| `biome.jsonc` | Modify | Drop transient overrides for the 3 rewritten files |

## Interfaces / Contracts

```ts
// domain/url-repository.ts — PORT
interface UrlRepository {
  findByHash(urlHash: string): Promise<ShortenedUrl | null>;
  findByCode(code: string): Promise<ShortenedUrl | null>;
  existsByCode(code: string): Promise<boolean>;
  create(input: { code: string; longUrl: string; urlHash: string }): Promise<ShortenedUrl>;
}

// domain/errors.ts
class DomainError extends Error {}                    // base
class InvalidUrlError extends DomainError {}          // → 400
class UrlNotFoundError extends DomainError {}         // → 404
class CodeGenerationExhaustedError extends DomainError {} // → 503

// application/short-code-generator.ts
class ShortCodeGenerator {
  constructor(private repo: UrlRepository,
    private len = Number(process.env.SHORT_CODE_LENGTH ?? 7),
    private maxAttempts = 5) {}
  async generate(): Promise<ShortCode> // loops ≤maxAttempts, else CodeGenerationExhaustedError
}
// base62 alphabet: [0-9A-Za-z], crypto.randomInt per char
```

```prisma
model Url {
  id        String   @id @default(cuid())
  code      String   @unique          // base62 short code
  longUrl   String                     // normalized URL as stored
  urlHash   String   @unique           // SHA-256 hex of normalized URL (idempotency)
  createdAt DateTime @default(now())
  @@index([urlHash])
}
```
Route error map (single helper in each route): `InvalidUrlError`→400, `UrlNotFoundError`→404, `CodeGenerationExhaustedError`→503, unknown→500.

## Testing Strategy (Strict TDD active — `pnpm test` / vitest)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `LongUrl` normalize+hash edge cases; `ShortCode` guard; `DomainError` types | Pure, no infra |
| Unit | `ShortCodeGenerator` retry + exhaustion path | `InMemoryUrlRepository` fake forced to collide |
| Unit | `ShortenUrlUseCase` idempotency (2nd call returns same code); `ResolveUrlUseCase` not-found | `createEngine({ repository: fake })` |
| Integration | `PrismaUrlRepository` against a real SQLite file (`urlHash`/`code` uniqueness) | temp `file:` DB, `migrate deploy`, teardown |
| E2E | shorten→redirect through the actual route `action`/`loader` | one `s.$code.e2e.test.ts`, in-process, fake repo |

`InMemoryUrlRepository` (test-only, under `libs/engine/src/infra/__tests__/` or `src/test-support/`) implements the port with a `Map` keyed by hash+code, enforcing both uniqueness constraints so use-case tests exercise the same contract as Prisma. Domain/use-case tests never touch Prisma → fast and infra-free.

## Migration / Rollout

Single initial Prisma migration (`prisma migrate dev` locally, committed under `prisma/migrations/`). **Docker**: build stage runs `pnpm --filter @url-shortener/engine exec prisma generate`; production stage copies the generated client (`node_modules/.prisma` + `@prisma/client`) and `libs/engine/prisma/`; an entrypoint script runs `prisma migrate deploy` before `pnpm start`. `DATABASE_URL=file:/app/data/app.db`, `/app/data` on named volume `url-shortener-data`. Since the engine ships as TS source (`main: src/index.ts`), the generated Prisma client must be present at runtime — it is, via the copied `node_modules`. Rollback: revert the PR; drop the volume to reset data.

## Later-slice hooks (NOT implemented here)
- **Stats (Slice 2)**: `ShortenedUrl` gains `clickCount`/`lastClickedAt`; a `RecordClickUseCase` + `repo.incrementClicks(code)` extend the port. No change to shorten/resolve contracts.
- **Caching (Slice 3)**: a `CachingUrlRepository` decorator wraps `UrlRepository` (cache-aside on `findByCode`) — injected at the composition root, invisible to use cases.
- **Security (Slice 4)**: scheme allowlist + private-IP rejection extend `LongUrl.create`; rate limiting is route middleware.

## Open Questions
- [ ] None blocking. Prisma client generation in the multi-stage Docker build is the main execution risk (see Migration) — mitigated by copying the generated client + running `generate` in the build stage.
