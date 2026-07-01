# Design: Setup Foundations (Slice 0)

## Technical Approach

Establish a monorepo quality harness with **zero product-behavior change**: Vitest (test), Biome (lint/format), Turbo task wiring, and a single GitHub Actions pipeline. The strategy is *forward-compatibility over completeness* — Slice 0 lands config plus one smoke test per workspace; concrete unit/e2e cases are owned by their feature slices (per `project/slice-plan`). Every config choice is picked so Slice 1+ add test files without touching config.

## Architecture Decisions

### Decision: Vitest config topology (shared base + per-workspace)

**Choice**: Per-workspace Vitest configs — `libs/engine/vitest.config.ts` (Node environment, plain TS) and `applications/web/vitest.config.ts` (jsdom for component/loader tests) — each run independently via Turbo's `test` task fan-out. Web uses a **standalone Vitest config**, NOT the existing `vite.config.ts`.

> **Implementation deviation (accepted at verify)**: a root `vitest.workspace.ts` was planned but not created — Turbo already fans `test` out to each workspace's own `vitest run`, so a workspace file is redundant. Each workspace owns its env + `tsconfigPaths`. Verified green without it.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single root config, `environmentMatchGlobs` | One file, but conflates Node lib + jsdom web; brittle globs | Rejected |
| Reuse web `vite.config.ts` for tests | DRY, but `reactRouter()` plugin injects route/SSR transforms that break Vitest collection | Rejected |
| Workspace file + per-project configs | Slight duplication; each workspace owns env + `vite-tsconfig-paths` | **Chosen** |

**Rationale**: The `reactRouter()` Vite plugin is a full-stack framework plugin (route manifest, SSR entry) — running Vitest through it is the exact "config friction" the proposal flags. A dedicated web Vitest config keeps only `tsconfigPaths()` for `workspace:*` alias resolution and `@url-shortener/engine`, isolating tests from the framework.

### Decision: e2e/integration layering

**Choice**: Web config declares a `test.include` split — `**/*.test.ts(x)` (unit) and a reserved `**/*.e2e.test.ts` glob wired now but exercised only by a smoke test. No Playwright in Slice 0.

**Alternatives**: Add Playwright now (rejected — real browser e2e is out of scope, adds CI weight for zero cases). Single flat glob (rejected — no seam for slices to add integration tests without reconfig).

**Rationale**: React Router loaders/actions are testable in-process (call the exported `loader`/`action`) — no browser needed for Slices 1–4. The `.e2e.test.ts` glob is the forward-compatible seam; Slice 5 can bolt on Playwright as its own concern.

### Decision: Biome handling of intentionally-flawed code

**Choice**: `biome.json` enables `recommended` rules + formatter. Pre-existing flaws are contained via **path-scoped `overrides`** (relax the specific rules that fire in `libs/engine/src/shortened-url.ts` and the two route files), NOT global rule disabling or blanket ignore.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Global rule relaxation | CI passes, but disables the check everywhere — new code loses coverage | Rejected |
| `ignore` the flawed files entirely | Simple, but format drift + zero lint on them | Rejected |
| Path-scoped `overrides` on named files/rules | Verbose; but new code keeps full `recommended`; flaws quarantined | **Chosen** |

**Rationale**: The flawed files are deleted/rewritten in Slice 1, so their overrides are transient and self-documenting (a visible list of debt). New code written from Slice 1 on is held to full `recommended`. Format still applies everywhere (safe, mechanical). Biome does not typecheck, so it coexists with `tsc` strict cleanly; Tailwind 4 is CSS-in-Vite, untouched by Biome's JS/TS linting.

### Decision: Turbo task wiring

**Choice**:
- `test`: `dependsOn: ["^build"]`, cacheable, `outputs: []` (no artifacts; cache keyed on inputs).
- `lint` / `format:check`: no `dependsOn`, cacheable, `outputs: []`.
- `format` (write): `cache: false` (mutates files; caching a write is unsafe).
- `typecheck`: keep existing; add `dependsOn: ["^build"]` so `@url-shortener/engine` types resolve for the web app.

**Alternatives**: `test dependsOn typecheck` (rejected — couples gates; CI orders them explicitly, and Vitest surfaces type errors in test files anyway). All-cacheable including format-write (rejected — caching a mutation is a correctness hazard).

**Rationale**: `^build` on `test`/`typecheck` guarantees the engine's consumer sees built/typed outputs. Cacheable read-only tasks give the biggest CI win on unchanged workspaces.

### Decision: CI pipeline shape

**Choice**: Single job, single Node version (matches Docker `node:24-alpine` — pin Node 24), ordered steps: `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` → `build`. pnpm store cached via `actions/setup-node` `cache: pnpm`. Triggers: PR + push to `main`.

> **Runtime note**: Node 20 reached end-of-life on 2026-04-30 and is unsupported. This slice bumps the Docker base image `node:20-alpine` → `node:24-alpine` (Active LTS, EOL 2028-04-30) and pins CI to Node 24 so the runtime is supported and CI matches the container. See Engram `project/node-runtime`.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Node version matrix | Broader coverage; but repo targets one runtime (Docker node:24) — matrix is wasted minutes | Rejected |
| Parallel jobs per gate | Faster wall-clock; but re-installs deps per job, more YAML, no benefit at this size | Rejected |
| Single ordered job | Sequential; simplest, fail-fast, one install, Turbo cache reused across steps | **Chosen** |

**Rationale**: Fail-fast ordering (cheapest gate first: lint → typecheck → test → build) gives fast feedback. One job means one dependency install and one warm Turbo cache reused across all four steps. Node 24 (Active LTS) replaces the EOL Node 20. Turbo remote caching is documented as a later extension, not wired now.

## Data Flow

```
  PR / push:main
       │
       ▼
  setup-node (pnpm store cache)
       │
       ▼
  install --frozen-lockfile
       │
       ▼
  turbo lint ─→ turbo typecheck ─→ turbo test ─→ turbo build
       │             │                 │              │
       └── biome ────┴── tsc ──────────┴── vitest ────┴── rr build / tsc
                              (Turbo cache reused across steps, keyed per workspace)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `biome.json` | Create | `recommended` + formatter; path-scoped overrides for the flawed files |
| ~~`vitest.workspace.ts`~~ | Not created | Planned but omitted — Turbo `test` fan-out over per-workspace configs makes it redundant (accepted deviation) |
| `libs/engine/vitest.config.ts` | Create | `environment: node`, tsconfigPaths |
| `applications/web/vitest.config.ts` | Create | `environment: jsdom`, tsconfigPaths, unit + reserved `.e2e.test.ts` globs; standalone (not vite.config.ts) |
| `turbo.json` | Modify | Add `test`, `lint`, `format:check`, `format`; add `^build` to `typecheck` |
| `package.json` (root) | Modify | Scripts `test`/`lint`/`format`/`format:check` → turbo; add Vitest + Biome devDeps |
| `applications/web/package.json` | Modify | `test` script + Vitest/jsdom devDeps |
| `libs/engine/package.json` | Modify | `test` script + Vitest devDep |
| `.github/workflows/ci.yml` | Create | Single ordered job, pnpm cache, Node 24 |
| `Dockerfile` | Modify | Bump base image `node:20-alpine` → `node:24-alpine` (Node 20 is EOL) |
| `libs/engine/src/*.smoke.test.ts` | Create | Trivial green smoke test |
| `applications/web/app/*.smoke.test.ts` | Create | Trivial green smoke test |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Harness runs green | One trivial smoke test per workspace (`expect(true).toBe(true)`-class assertion on a real import) |
| Integration | Config resolves aliases | Smoke test imports `@url-shortener/engine` to prove `workspace:*` + tsconfigPaths wiring |
| E2E | None in Slice 0 | `.e2e.test.ts` glob reserved; real cases owned by feature slices |

## Migration / Rollout

No migration required. All changes are additive config + CI + smoke tests. Rollback = revert the PR (restores current state, zero data/behavior impact).

## Open Questions

- [ ] None blocking. (Playwright vs in-process e2e is deferred to Slice 5 by decision above.)
