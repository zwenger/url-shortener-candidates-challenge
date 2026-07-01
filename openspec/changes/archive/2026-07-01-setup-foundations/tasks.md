# Tasks: Setup Foundations (Slice 0)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250-350 (config + CI + smoke tests, no source refactor) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full Slice 0 harness (Biome, Vitest x2, Turbo, CI, Node 24, smoke tests) | PR 1 (single) | Config-only, additive, no source logic touched; low review load justifies one PR |

## Phase 1: Biome (Lint + Format)

- [x] 1.1 Create root `biome.json` with `recommended` rules + formatter enabled (no ESLint/Prettier config added anywhere). **Deviation**: created as `biome.jsonc` instead of `biome.json` — Biome's own config parser rejects `//` comments in plain `.json` (verified empirically), and the design explicitly requires a visible comment above the overrides block. `.jsonc` is Biome's documented mechanism for a commented config.
- [x] 1.2 Add path-scoped `overrides` in `biome.jsonc` relaxing only the specific failing rules for `libs/engine/src/shortened-url.ts`, `applications/web/app/routes/_index.tsx`, `applications/web/app/routes/s.$code.tsx`. Comment added above the overrides block. Actual rules found firing and scoped: `lint/correctness/noEmptyPattern` and `lint/style/useTemplate` (both only in `_index.tsx`; `shortened-url.ts` and `s.$code.tsx` currently have zero recommended-rule violations, kept in the override list per design for forward safety).
- [x] 1.3 Added root `package.json` devDep on `@biomejs/biome` (`^2.5.2`) and internal scripts `lint:biome` (`biome check .`), `format:biome` (`biome format --write .`), `format:check:biome` (`biome format .`).
- [x] 1.4 Ran `biome check .` locally — zero violations outside the scoped overrides (24 files checked, 0 errors).

## Phase 2: Vitest — libs/engine (Unit Config)

- [x] 2.1 Created `libs/engine/vitest.config.ts`: `environment: "node"`, `test.include: ["**/*.test.ts"]`, `tsconfigPaths()` plugin.
- [x] 2.2 Added `vitest` (`^4.1.9`) + `vite-tsconfig-paths` (`^5.1.4`) devDeps and `test` script (`vitest run`) to `libs/engine/package.json`. **Deviation**: used Vitest 4.x (not 3.x) — Vitest 4 declares Vite 7 as a supported peer; Vitest 3 predates Vite 7 support, and `applications/web` is on Vite `^7.1.7`, so 4.x keeps both workspaces on a consistent, compatible major.
- [x] 2.3 Created `libs/engine/src/index.smoke.test.ts` importing `generateShortCode` from `./index` and asserting it is a function. No domain assertions.

## Phase 3: Vitest — applications/web (Route-Aware Config, Standalone)

- [x] 3.1 Created `applications/web/vitest.config.ts` as a standalone config — does NOT import/extend/merge `vite.config.ts`. Only `tsconfigPaths()` plugin, own `defineConfig`.
- [x] 3.2 Configured `environment: "jsdom"` and `test.include: ["**/*.test.ts", "**/*.test.tsx", "**/*.e2e.test.ts"]` (reserved e2e glob wired now, no `.e2e.test.ts` files yet).
- [x] 3.3 Added `vitest` (`^4.1.9`) + `jsdom` (`^29.1.1`) devDeps and `test` script (`vitest run`) to `applications/web/package.json`.
- [x] 3.4 Created `applications/web/app/root.smoke.test.ts` importing `generateShortCode` from `@url-shortener/engine` and asserting it is a function. No route/loader/action assertions.

## Phase 4: Turbo + Root Script Wiring

- [x] 4.1 In `turbo.json`, added `test` task: `dependsOn: ["^build"]`, cacheable, `outputs: []`.
- [x] 4.2 In `turbo.json`, added `lint` and `format:check` tasks. **Deviation**: implemented as thin aggregator tasks (`dependsOn: ["//#lint:biome"]` / `["//#format:check:biome"]`) that depend on dedicated root-only Turbo tasks (`//#lint:biome`, `//#format:check:biome`), which in turn run the root package's `lint:biome`/`format:check:biome` scripts. Reason: Biome lints the whole repo from one root config (no workspace defines its own `lint` script), and Turbo's own recursion guard (`recursive_turbo_invocations`) rejects a root `package.json` script named `lint` that itself invokes `turbo run lint` — verified empirically. The root-task (`//#`) + `dependsOn` pattern is Turborepo's documented, non-recursive way to run a root-only command through the task graph while keeping `pnpm lint` as the public entry point.
- [x] 4.3 In `turbo.json`, added `format` task (write mode) via the same pattern: `dependsOn: ["//#format:biome"]`, `cache: false` on both the aggregator and the underlying `//#format:biome` task (mutates files).
- [x] 4.4 In `turbo.json`, added `dependsOn: ["^build"]` to the existing `typecheck` task.
- [x] 4.5 In root `package.json`, scripts `test` → `turbo run test`, `lint` → `turbo run lint`, `format` → `turbo run format`, `format:check` → `turbo run format:check` (all confirmed non-recursive and green).

## Phase 5: Node 24 Runtime Bump

- [x] 5.1 Modified `Dockerfile`: `FROM node:20-alpine` → `FROM node:24-alpine`.
- [x] 5.2 Verified no other file pinned Node 20 (no `.nvmrc`, no `.tool-versions`, no prior `engines` field existed). Added `"engines": { "node": ">=24" }` to root `package.json` for explicit consistency with the Dockerfile. Local dev Node (`v24.14.0`) already matches.

## Phase 6: CI Pipeline

- [x] 6.1 Created `.github/workflows/ci.yml` triggering on `pull_request` (any target branch, default `pull_request:` with no `branches` filter) and `push` to `main`.
- [x] 6.2 Single job `quality-gates`: `actions/checkout@v4` → `pnpm/action-setup@v4` (required so `actions/setup-node`'s `cache: pnpm` can find the pnpm binary) → `actions/setup-node@v4` pinned to `node-version: 24` with `cache: pnpm` → `pnpm install --frozen-lockfile`.
- [x] 6.3 Ordered steps after install: `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`, no `continue-on-error` (default fail-fast preserved).

## Phase 7: Verification

- [x] 7.1 Ran `pnpm lint` from repo root — zero violations green; deliberately introduced a violation (empty destructure pattern in a non-overridden file) and confirmed `pnpm lint` failed with `Tasks: 0 successful, 1 total` / `Failed: //#lint:biome` and non-zero pnpm exit; reverted, confirmed clean diff and green lint again.
- [x] 7.2 Ran `pnpm test` from repo root — both smoke tests (`libs/engine/src/index.smoke.test.ts`, `applications/web/app/root.smoke.test.ts`) pass via Turbo (`Tasks: 3 successful, 3 total`), verified from a fresh `pnpm install` + cleared Turbo cache.
- [x] 7.3 Ran `pnpm build` from repo root — succeeds (`Tasks: 2 successful, 2 total`), engine `tsc` build + web `react-router build` (Vite client/SSR) both green, verified from a fresh cache.
- [ ] 7.4 **Not executed** — this apply batch was explicitly instructed not to commit or push (changes left in working tree for review), so no PR/branch push or `act` run was performed. Deferred to whoever pushes/opens the PR; local verification already ran the exact same ordered commands (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) the workflow invokes, on Node 24 (local `node -v` = `v24.14.0`), so a green CI run is expected.
- [x] 7.5 Reviewed `proposal.md` Success Criteria against the verified state above — all criteria satisfied by Phases 1–6 and 7.1–7.3 (see Apply Progress notes for the explicit mapping); the only open item is the live-CI confirmation in 7.4, which requires a push this batch does not perform.

## Notes

- **Standard Mode applies to this slice** — pure config/tooling, no business logic. Strict TDD (red-green-refactor) begins in Slice 1 once the runner and a real feature exist. Do not fabricate red-green cycles for config files.
- Biome `overrides` added in 1.2 are **transient debt**: remove them in Slice 1 when `shortened-url.ts` and the two route files are rewritten under the hexagonal refactor.
- Node 20 → Node 24 must be consistent across `Dockerfile` (Phase 5) and CI (`actions/setup-node`, Phase 6) — a mismatch reintroduces the exact problem this decision fixes.
