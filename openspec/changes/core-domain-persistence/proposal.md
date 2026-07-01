# Proposal: Core Domain + Persistence (Slice 1)

## Intent

Today `libs/engine` stores URLs in a module-level `Map` (lost on restart, not shared across instances) and generates codes from a 2-char "abc" alphabet (only 9 codes, silent overwrite on collision). Web routes import domain internals directly — no boundary, no validation, bare 404s. This slice replaces that core with a light hexagonal architecture, real persistence (Prisma + SQLite, survives restart), collision-safe base62 code generation, idempotent shortening, boundary validation, and typed errors mapped to HTTP. It is the load-bearing slice every later slice (stats, caching, security, UI) depends on. Builds on Slice 0 (Vitest, Biome, CI, Node 24, strict TDD already in place).

## Scope

### In Scope
- Hexagonal restructure of `libs/engine`: `domain/` (entities, value objects, domain errors, ports), `application/` (use cases: shorten URL, resolve code), `infra/` (Prisma adapter). Domain MUST NOT import infra.
- `UrlRepository` port + `PrismaUrlRepository` adapter; Prisma schema + initial migration; SQLite persisted via a Docker volume.
- Base62 short-code generation, configurable length; DB unique constraint on `code` + bounded retry; throw `CodeGenerationExhaustedError` on exhaustion (no infinite loop).
- Idempotency: same long URL returns the existing code (find-or-create).
- Zod validation at boundaries (URL format at minimum).
- Typed domain errors mapped to HTTP status at the route boundary.
- Rewrite both web routes (`_index.tsx`, `s.$code.tsx`) to call use cases via the repository instead of the `Map`.
- Docker: wire `prisma generate` into the build stage; add a volume for the SQLite file.
- Remove the transient Biome overrides for the three rewritten files.
- Strict TDD: unit tests for domain/use cases + a real e2e test for shorten→redirect.

### Out of Scope (later slices)
- Click-stats tracking (Slice 2)
- Caching / LRU read path (Slice 3)
- Rate limiting, SSRF/private-IP rejection, scheme allowlist, security headers (Slice 4)
- UI redesign, list-with-stats view (Slice 5)

## Capabilities

### New Capabilities
- `url-shortening`: shorten a validated URL into a unique base62 code, idempotent by long URL, collision-safe with bounded retry.
- `url-redirection`: resolve a code to its long URL and redirect; typed not-found handling.
- `url-persistence`: `UrlRepository` port + Prisma/SQLite adapter; data survives restart.

### Modified Capabilities
- None (no pre-existing main specs).

## Approach

Ports & adapters inside `libs/engine`. Domain defines the `UrlRepository` interface and `ShortenedUrl` entity + value objects (`LongUrl`, `ShortCode`); use cases orchestrate. `PrismaUrlRepository` implements the port in `infra/`. Idempotency and retry-on-collision live in the use case, backed by a DB unique constraint. Routes become thin adapters: parse+Zod-validate, call the use case, map typed domain errors to HTTP. Web builds the engine's public API from a composition root; env (`PUBLIC_URL`, `DATABASE_URL`) validated at startup.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `libs/engine/src/shortened-url.ts` | Removed | Map + broken code-gen deleted |
| `libs/engine/src/{domain,application,infra}/**` | New | Hexagonal layers, port, use cases, Prisma adapter |
| `libs/engine/src/index.ts` | Modified | New public API surface |
| `libs/engine/prisma/schema.prisma` + migrations | New | `Url` model, unique `code`, long-url index |
| `applications/web/app/routes/_index.tsx` | Modified | Zod validation + shorten use case + error mapping |
| `applications/web/app/routes/s.$code.tsx` | Modified | Resolve use case + typed 404 |
| `Dockerfile` | Modified | `prisma generate` in build; ship client + migrations |
| `docker-compose.yml` | Modified | Named volume for SQLite file + `DATABASE_URL` |
| `biome.jsonc` | Modified | Drop transient overrides for the 3 rewritten files |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prisma client not generated in Docker (only `src` copied today) | High | Add `prisma generate` to build stage; copy generated client + migrations into production stage; run `migrate deploy` on start |
| SQLite not persisted → "survives restart" silently fails | High | Named volume/bind mount for the DB file; document path in README |
| Retry-on-collision infinite loop | Med | Bounded retry + `CodeGenerationExhaustedError`; unit test the exhaustion path |
| Domain accidentally depends on infra | Med | Port in domain, adapter in infra; verify import direction (test/lint) |
| Idempotency index on raw long URL length limits | Low | Decide raw-vs-hash index at proposal Q round; document trade-off |

## Rollback Plan

Slice is a single chained PR on top of `slice-0-setup-foundations`. Revert the PR to restore the Slice-0 state (Map-based engine, transient Biome overrides). No data migration to unwind beyond dropping the SQLite volume.

## Dependencies

- Slice 0 merged (Vitest, Biome, CI, Node 24, strict TDD).
- Prisma + `@prisma/client` added to `libs/engine`.

## Success Criteria

- [ ] Data survives a container restart (challenge: Persistence).
- [ ] Repository pattern abstracts persistence; domain has zero infra imports (SOLID, Repository pattern).
- [ ] Base62 codes, collision-safe; exhaustion path tested (unique codes requirement).
- [ ] Same long URL is idempotent (returns existing code).
- [ ] Invalid URL input rejected with a meaningful error (Input validation).
- [ ] Typed domain errors mapped to correct HTTP status at routes.
- [ ] `docker compose up` builds (Prisma generated) and shorten→redirect works end-to-end.
- [ ] Unit tests (domain/use cases) + e2e (shorten→redirect) green in CI; transient Biome overrides removed.

## Proposal question round

These are genuine product/architecture tradeoffs — please confirm before spec/design:

1. **Idempotency index**: unique index on the raw `longUrl` string, or on a hash (e.g. SHA-256) of it? Hash gives a fixed-width index and avoids long-URL length limits; raw is simpler and human-readable in the DB. Preference?
2. **Default short-code length**: 7 or 8 base62 chars? (7 ≈ 3.5T combinations — ample for a demo; 8 is more future-proof.)
3. **SQLite file location / volume**: fixed path like `/app/data/app.db` on a named Docker volume `url-shortener-data`? Confirm path and volume name so README + compose match.
4. **URL normalization before dedup**: should we normalize (lowercase host, strip trailing slash, drop default ports) before the idempotency check, or treat URLs byte-for-byte as entered? Normalization improves dedup hit rate but can surprise users who expect their exact URL back.
5. **Migrations on container start**: run `prisma migrate deploy` automatically on startup, or keep it a documented manual step? Auto is smoother for the grader; manual is more explicit.
