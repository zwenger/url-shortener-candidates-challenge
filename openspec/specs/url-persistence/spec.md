# URL Persistence Specification

## Purpose

Provide a hexagonal `UrlRepository` port with a Prisma/SQLite adapter so the domain has zero infrastructure dependencies, and so shortened-URL data survives process and container restarts.

## Requirements

### Requirement: UrlRepository Port Owned by the Domain

The domain layer MUST define a `UrlRepository` port (interface) with at least: save a `ShortenedUrl`, find by exact code, and find by normalized-URL hash. The domain and application layers MUST NOT import from the infrastructure layer; only the infrastructure layer MAY import domain types to implement the port.

#### Scenario: Domain has zero infra imports

- GIVEN the `libs/engine` source tree is separated into `domain/`, `application/`, and `infra/`
- WHEN imports are inspected (via lint rule or dependency test)
- THEN no file under `domain/` or `application/` imports anything from `infra/`

#### Scenario: Use cases depend only on the port

- GIVEN the shorten and resolve use cases need persistence
- WHEN they are implemented
- THEN they depend on the `UrlRepository` interface type only, never on `PrismaUrlRepository` directly

### Requirement: PrismaUrlRepository Adapter

The infrastructure layer MUST provide a `PrismaUrlRepository` that implements `UrlRepository` using Prisma against a SQLite database, backed by a `Url` model with a unique index on `code` and a unique index on `urlHash`.

#### Scenario: Save persists a new record

- GIVEN a valid `ShortenedUrl` with a unique code and hash
- WHEN `save` is called on `PrismaUrlRepository`
- THEN a new row is created in the `Url` table with matching `code`, `longUrl`, and `urlHash`

#### Scenario: Find by code returns the matching record

- GIVEN a persisted row with `code = "AbC1234"`
- WHEN `findByCode("AbC1234")` is called
- THEN the repository returns a `ShortenedUrl` reconstructed from that row

#### Scenario: Find by hash returns the matching record

- GIVEN a persisted row with `urlHash = "<sha256>"`
- WHEN `findByHash("<sha256>")` is called
- THEN the repository returns the matching `ShortenedUrl`, enabling idempotent lookups

#### Scenario: Unique constraint violation surfaces as a collision signal

- GIVEN a row with `code = "AbC1234"` already exists
- WHEN `save` is called with a different record that also has `code = "AbC1234"`
- THEN the adapter's unique-constraint violation is surfaced in a way the shorten use case can catch and treat as a code collision (triggering retry), not an unhandled crash

### Requirement: Data Survives Restart via a Named Volume

The SQLite database file MUST live at `/app/data/app.db` inside the container, backed by a named Docker volume `url-shortener-data`, so that stopping and restarting the container preserves previously shortened URLs.

#### Scenario: Restart preserves previously shortened URLs

- GIVEN a URL was shortened and its record persisted while the container was running
- WHEN the container is stopped and started again (same volume attached)
- THEN a lookup for that URL's short code still resolves to the original long URL

### Requirement: Migrations Applied Automatically on Container Start

The container's startup sequence MUST run `prisma migrate deploy` against the SQLite database before the application begins accepting requests, so a fresh volume is schema-ready without a manual step.

#### Scenario: Fresh volume gets migrated automatically

- GIVEN a new, empty named volume is attached to the container for the first time
- WHEN the container starts
- THEN `prisma migrate deploy` runs and creates the `Url` table before the app starts listening

#### Scenario: Already-migrated volume starts cleanly

- GIVEN the volume already has the current migrations applied
- WHEN the container restarts
- THEN `prisma migrate deploy` runs as a no-op and the app starts without error

## Test Strategy (per Slice 0 Test Strategy Contract)

- Unit/integration tests (in `libs/engine`) MUST cover `PrismaUrlRepository`'s save / findByCode / findByHash against a test SQLite database.
- Restart-survival and migration-on-start are verified operationally (documented manual/CI check via `docker compose up`), not as a Vitest unit test, since they depend on container lifecycle rather than in-process behavior.
