# Proposal: Setup Foundations (Slice 0)

## Intent

The repo has **no test runner, no linter/formatter, and no CI**. The challenge treats tests and a linter/formatter as mandatory senior-signal quality gates, and every later slice (domain, persistence, caching, stats, security, UI) must be TDD-provable. This slice establishes that harness so strict TDD (red-green-refactor) can be enabled for all subsequent work. **No product behavior changes.**

## Scope

### In Scope
- **Vitest** as the single test runner: unit config for `libs/engine`, and a route/integration ("e2e-style") config for `applications/web` (React Router loaders/actions).
- **Biome** as the single lint + format tool (`biome.json`), replacing the need for ESLint+Prettier — no existing ESLint investment to preserve.
- **Turbo tasks** `test`, `lint`, `format` wired into `turbo.json` so `turbo` runs them across workspaces.
- **Root + workspace `package.json` scripts** for `test`, `lint`, `format` delegating through turbo/per-package.
- **GitHub Actions CI**: single workflow `install (pnpm cached) -> lint -> typecheck -> test -> build`, on PR and push to `main`.
- A trivial smoke test per workspace to prove the harness runs green in CI.

### Out of Scope (later slices)
- Domain / hexagonal refactor, persistence (Prisma/SQLite), short-code generation, idempotency — **Slice 1**.
- Click-stats tracking — **Slice 2**. Caching — **Slice 3**.
- Abuse prevention & security (rate limiting, SSRF, headers) — **Slice 4**. UI redesign — **Slice 5**.
- Turbo remote caching, coverage thresholds/gates, observability tooling — deferred/documented.
- Fixing the intentionally-flawed engine/route logic (only the harness lands here).

## Capabilities

### New Capabilities
- `dev-tooling`: test runner (Vitest), lint/format tool (Biome), and turbo/script wiring that make quality gates runnable locally and reproducible.
- `ci-pipeline`: GitHub Actions workflow enforcing lint -> typecheck -> test -> build on PR and push to main.

### Modified Capabilities
- None.

## Approach

Add Vitest to each workspace (root-level shared config where practical; web uses a Vite-aware config, engine a plain node config). Add `biome.json` at the repo root with sane defaults. Register `test`/`lint`/`format` in `turbo.json` (test/lint non-persistent, cacheable; format may be `cache:false`) and expose matching root scripts (`turbo test`, `turbo lint`, `turbo format`). Add `.github/workflows/ci.yml` that sets up pnpm with cache and runs the four gates in order. Include one smoke test per package so CI proves the pipeline is green before real tests arrive in Slice 1.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `turbo.json` | Modified | Add `test`, `lint`, `format` tasks |
| `package.json` (root) | Modified | Add `test`/`lint`/`format` scripts; add Vitest + Biome devDeps |
| `applications/web/package.json` | Modified | Add `test` script + Vitest devDeps |
| `libs/engine/package.json` | Modified | Add `test` script + Vitest devDeps |
| `biome.json` | New | Root lint + format config |
| `vitest.config.*` (root + per-workspace) | New | Test runner config |
| `.github/workflows/ci.yml` | New | CI pipeline |
| `*/**.smoke.test.ts` | New | Trivial green smoke tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Biome flags the intentionally-flawed existing code, blocking CI | Med | Scope Biome to enforce format + safe rules; treat pre-existing violations pragmatically (targeted ignores) since real fixes land in later slices |
| Vitest + Vite/React Router config friction in web app | Med | Start with engine unit config; add web route/integration config incrementally with a smoke test to confirm |
| PR exceeds 400-line review budget | Low | Config-only slice; keep it lean, no source refactors |

## Rollback Plan

Revert the PR. All changes are additive config + CI + smoke tests; no runtime/domain code is touched, so reverting fully restores the current state with zero data or behavior impact.

## Dependencies

- pnpm 10.20 workspaces + Turborepo (already present).
- GitHub Actions (repo hosted on GitHub).

## Success Criteria

- [x] `pnpm test`, `pnpm lint`, `pnpm format` run across all workspaces via turbo and pass. (Verified locally from a fresh install + cleared Turbo cache.)
- [ ] `.github/workflows/ci.yml` runs lint -> typecheck -> test -> build on PR and push to main, green. **Not yet confirmed live** — this apply batch did not push/open a PR (explicit instruction: leave changes in working tree for review). Local runs execute the identical ordered commands on Node 24; live CI confirmation is deferred to the PR push step.
- [x] At least one passing smoke test exists in `libs/engine` and `applications/web`.
- [x] Strict TDD can be enabled for Slice 1 (test runner + command resolved: `vitest run` per workspace, wired through `pnpm test`).
- [x] No change to application behavior; diff is config/CI/tests only (verified: source diffs are import-order only, no logic/markup changes).
