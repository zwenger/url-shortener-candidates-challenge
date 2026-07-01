# Dev Tooling Specification

## Purpose

Establish a single, reproducible local quality-gate harness (test runner + lint/format tool + turbo task wiring) so every workspace can run `test`, `lint`, and `format` the same way locally and in CI, and so strict TDD can be enabled starting with Slice 1. This capability is pure tooling — it introduces no product behavior.

## Requirements

### Requirement: Vitest Test Runner Per Workspace

The system MUST provide a Vitest configuration for `libs/engine` (plain unit config, no DOM/browser environment) and a separate Vitest configuration for `applications/web` (Vite-aware, capable of exercising React Router loaders/actions for route-level tests). Each workspace MUST expose a `test` script that runs its own Vitest config.

#### Scenario: Running unit tests in libs/engine

- GIVEN `libs/engine` has a Vitest config and a `test` script
- WHEN a developer runs `pnpm --filter engine test` (or the workspace's `test` script directly)
- THEN Vitest executes and reports pass/fail without requiring any other workspace to be built first

#### Scenario: Running route-level tests in applications/web

- GIVEN `applications/web` has a Vitest config capable of loading React Router route modules
- WHEN a developer runs `pnpm --filter web test`
- THEN Vitest executes against that config and can import and invoke a route's `loader` or `action` export directly

#### Scenario: Test runner is the only one in the repo

- GIVEN the repository previously had no test runner
- WHEN any workspace's `test` script is inspected
- THEN it invokes Vitest exclusively; no other test framework is present in any workspace

### Requirement: Biome as the Single Lint and Format Tool

The system MUST use Biome as the only linting and formatting tool, configured via a single root-level `biome.json`. The system MUST NOT introduce ESLint or Prettier configuration alongside Biome.

#### Scenario: Linting the whole repo

- GIVEN a root `biome.json` exists
- WHEN a developer runs the repo's `lint` script
- THEN Biome checks all workspace source files against the configured rules and reports violations with non-zero exit on failure

#### Scenario: Formatting the whole repo

- GIVEN a root `biome.json` exists
- WHEN a developer runs the repo's `format` script
- THEN Biome formats all workspace source files in place (or checks formatting in CI mode) without invoking any other formatter

#### Scenario: Pre-existing intentionally-flawed code does not block the gate

- GIVEN the repository contains intentionally-flawed domain/route code that later slices will fix
- WHEN Biome lint runs against that code
- THEN the lint configuration MUST be scoped (rule selection or targeted ignores) so this slice's CI gate passes without requiring the flawed code to be rewritten

### Requirement: Turbo Task Wiring for test, lint, format

The system MUST register `test`, `lint`, and `format` as tasks in `turbo.json`, and the root `package.json` MUST expose matching scripts (`pnpm test`, `pnpm lint`, `pnpm format`) that invoke Turbo so all workspaces run consistently from the repo root.

#### Scenario: Running test across all workspaces from root

- GIVEN `turbo.json` defines a `test` task and root `package.json` has a `test` script delegating to `turbo run test`
- WHEN a developer runs `pnpm test` from the repo root
- THEN Turbo runs the `test` task in every workspace that defines it and the command exits non-zero if any workspace's tests fail

#### Scenario: Running lint and format across all workspaces from root

- GIVEN `turbo.json` defines `lint` and `format` tasks and root scripts delegate to them
- WHEN a developer runs `pnpm lint` or `pnpm format` from the repo root
- THEN Turbo runs the corresponding task across all workspaces that define it

#### Scenario: Task cacheability is intentional

- GIVEN `test` and `lint` are deterministic, side-effect-free checks
- WHEN `turbo.json` configures these tasks
- THEN `test` and `lint` MAY be cacheable, while `format` (which can mutate files) MUST be configured non-cached to avoid stale-write surprises

### Requirement: One Smoke Test Per Workspace

Each workspace (`libs/engine`, `applications/web`) MUST contain at least one trivial passing test whose sole purpose is proving the test harness runs and reports green end-to-end (config, imports, and runner wiring all work). Smoke tests MUST NOT assert real domain or route behavior — that is the responsibility of the slice that introduces the feature.

#### Scenario: Engine smoke test passes

- GIVEN `libs/engine` has a smoke test file
- WHEN `pnpm --filter engine test` runs
- THEN the smoke test passes, proving Vitest can resolve and execute a test in that workspace

#### Scenario: Web smoke test passes

- GIVEN `applications/web` has a smoke test file
- WHEN `pnpm --filter web test` runs
- THEN the smoke test passes, proving Vitest can resolve and execute a test in that workspace under its route-aware config

### Requirement: Test Strategy Contract for Later Slices

The system MUST document, as a binding contract, where each category of test lives and what this slice does versus what later slices must add. This prevents later slices from placing tests inconsistently or assuming e2e coverage exists before it does.

The contract is:
- **Unit tests** live alongside the code they cover, inside the workspace that owns that code (e.g. `libs/engine` unit tests test domain/application logic in `libs/engine`; future route-level unit tests, if any, live in `applications/web`).
- **Route/integration ("e2e-style") tests** for `applications/web` use the Vitest route-aware config established in this slice, and exercise React Router loaders/actions directly (no browser, no running server) — this slice provides ONLY the infrastructure and one smoke test; it MUST NOT contain real feature assertions.
- **Real e2e test cases land with their owning feature slice**, not in Slice 0:
  - The shorten -> redirect e2e flow (POST shorten, follow generated short code, assert redirect to original URL) is added in **Slice 1** (domain + persistence), once the real use case exists.
  - The UI interaction e2e flow (form submission, list view with statistics, loading/error states) is added in **Slice 5** (UI), once the real UI exists.
- Any slice adding a new capability MUST add its own tests in the workspace/location defined by this contract; it MUST NOT retrofit Slice 0's smoke tests into feature tests.

#### Scenario: Slice 1 adds the first real e2e case

- GIVEN Slice 0 only provides route-test infrastructure and a smoke test
- WHEN Slice 1 implements the shorten and redirect use cases
- THEN Slice 1 MUST add a route-level e2e-style test exercising shorten -> redirect using the infrastructure this slice built, rather than creating a new test setup

#### Scenario: Slice 5 adds the first UI flow e2e case

- GIVEN no UI interaction e2e test exists after Slice 0
- WHEN Slice 5 implements the redesigned UI
- THEN Slice 5 MUST add a UI flow e2e-style test using the same `applications/web` Vitest infrastructure, not a new/different test runner

#### Scenario: A reviewer can locate any test by type

- GIVEN the test strategy contract is documented
- WHEN a reviewer looks for a unit test, a route/integration test, or a UI flow test
- THEN the reviewer can find it in the workspace and location this contract defines, with no ambiguity about where new tests of a given type should be added
