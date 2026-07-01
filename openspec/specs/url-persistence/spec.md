# URL Persistence Specification

## Purpose

Provide a hexagonal `UrlRepository` port with a Prisma/SQLite adapter so the domain has zero infrastructure dependencies, and so shortened-URL data survives process and container restarts.

## Requirements

### Requirement: UrlRepository Port Owned by the Domain

The domain layer MUST define a `UrlRepository` port (interface) with at least: save a `ShortenedUrl`, find by exact code, find by normalized-URL hash, increment a URL's click count by exact code (`incrementClicks`), and list all `ShortenedUrl` records ordered by `createdAt` descending (`listAll`). The domain and application layers MUST NOT import from the infrastructure layer; only the infrastructure layer MAY import domain types to implement the port. Every adapter implementing `UrlRepository` (`PrismaUrlRepository`, `InMemoryUrlRepository`) MUST implement the full port, including `incrementClicks` and `listAll`, with equivalent observable behavior.

#### Scenario: Domain has zero infra imports

- GIVEN the `libs/engine` source tree is separated into `domain/`, `application/`, and `infra/`
- WHEN imports are inspected (via lint rule or dependency test)
- THEN no file under `domain/` or `application/` imports anything from `infra/`

#### Scenario: Use cases depend only on the port

- GIVEN the shorten, resolve, record-click, and list-urls use cases need persistence
- WHEN they are implemented
- THEN they depend on the `UrlRepository` interface type only, never on `PrismaUrlRepository` or `InMemoryUrlRepository` directly

#### Scenario: Prisma and in-memory adapters agree on incrementClicks

- GIVEN the same initial `ShortenedUrl` state is seeded into both `PrismaUrlRepository` (SQLite) and `InMemoryUrlRepository`
- WHEN `incrementClicks(code)` is called once on each
- THEN both adapters report `clickCount` incremented by 1 and a non-null `lastClickedAt`

#### Scenario: Prisma and in-memory adapters agree on listAll ordering

- GIVEN the same set of `ShortenedUrl` records with distinct `createdAt` values is seeded into both adapters
- WHEN `listAll()` is called on each
- THEN both return the records in the same `createdAt`-descending order

### Requirement: PrismaUrlRepository Adapter

The infrastructure layer MUST provide a `PrismaUrlRepository` that implements `UrlRepository` using Prisma against a SQLite database, backed by a `Url` model with a unique index on `code`, a unique index on `urlHash`, a `clickCount` column (integer, default `0`), and a nullable `lastClickedAt` column (datetime). The repository MUST implement `incrementClicks(code)` as an atomic update that increments `clickCount` by 1 and sets `lastClickedAt` to the current time, and MUST implement `listAll()` returning every record ordered by `createdAt` descending.

#### Scenario: Save persists a new record

- GIVEN a valid `ShortenedUrl` with a unique code and hash
- WHEN `save` is called on `PrismaUrlRepository`
- THEN a new row is created in the `Url` table with matching `code`, `longUrl`, and `urlHash`
- AND the new row has `clickCount = 0` and `lastClickedAt = null`

#### Scenario: Find by code returns the matching record

- GIVEN a persisted row with `code = "AbC1234"`
- WHEN `findByCode("AbC1234")` is called
- THEN the repository returns a `ShortenedUrl` reconstructed from that row, including `clickCount` and `lastClickedAt`

#### Scenario: Find by hash returns the matching record

- GIVEN a persisted row with `urlHash = "<sha256>"`
- WHEN `findByHash("<sha256>")` is called
- THEN the repository returns the matching `ShortenedUrl`, enabling idempotent lookups

#### Scenario: Unique constraint violation surfaces as a collision signal

- GIVEN a row with `code = "AbC1234"` already exists
- WHEN `save` is called with a different record that also has `code = "AbC1234"`
- THEN the adapter's unique-constraint violation is surfaced in a way the shorten use case can catch and treat as a code collision (triggering retry), not an unhandled crash

#### Scenario: Increment updates click count and timestamp atomically

- GIVEN a persisted row with `code = "AbC1234"` and `clickCount = 0`
- WHEN `incrementClicks("AbC1234")` is called
- THEN the row's `clickCount` becomes `1`
- AND `lastClickedAt` is set to the current time
- AND no separate read-then-write race is introduced (single atomic update)

#### Scenario: List all returns records newest first

- GIVEN multiple `ShortenedUrl` rows exist with different `createdAt` values
- WHEN `listAll()` is called
- THEN the returned array is ordered by `createdAt` descending

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
- Unit tests (in `libs/engine`, `InMemoryUrlRepository` fake) MUST cover `incrementClicks` and `listAll` behavior.
- Integration tests (in `libs/engine`) MUST cover `PrismaUrlRepository.incrementClicks` and `.listAll()` against a real SQLite test database, extending the existing integration suite.
