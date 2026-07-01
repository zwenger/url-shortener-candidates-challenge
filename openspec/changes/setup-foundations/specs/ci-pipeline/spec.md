# CI Pipeline Specification

## Purpose

Enforce the quality gates established by `dev-tooling` (lint, typecheck, test, build) automatically on every pull request and on every push to `main`, so no change can merge or land on `main` without passing all gates in a fixed, deterministic order.

## Requirements

### Requirement: CI Workflow Runs on PR and Push to Main

The system MUST define a GitHub Actions workflow at `.github/workflows/ci.yml` that triggers on pull requests targeting any branch and on pushes to `main`.

#### Scenario: Workflow triggers on a pull request

- GIVEN a pull request is opened or updated against the repository
- WHEN the PR event fires
- THEN the CI workflow runs automatically

#### Scenario: Workflow triggers on push to main

- GIVEN a commit is pushed directly to `main`
- WHEN the push event fires
- THEN the CI workflow runs automatically

### Requirement: Ordered Gate Sequence

The workflow MUST run the gates in this exact order: install dependencies -> lint -> typecheck -> test -> build. A failure at any gate MUST stop the workflow before later gates run, and MUST mark the workflow run as failed.

#### Scenario: All gates pass

- GIVEN a change that satisfies lint, typecheck, test, and build
- WHEN the workflow runs
- THEN all four gates execute in order and the workflow reports success

#### Scenario: Lint failure stops the pipeline

- GIVEN a change that fails Biome lint
- WHEN the workflow runs
- THEN the workflow fails at the lint step and does NOT run typecheck, test, or build

#### Scenario: Test failure stops the pipeline before build

- GIVEN a change that passes lint and typecheck but fails a Vitest test
- WHEN the workflow runs
- THEN the workflow fails at the test step and does NOT run the build step

### Requirement: Cached pnpm Install

The workflow MUST install dependencies using pnpm with dependency caching enabled, so repeated runs avoid re-downloading unchanged packages.

#### Scenario: Cache is used on a subsequent run

- GIVEN a previous workflow run already populated the pnpm cache for the current lockfile
- WHEN a new workflow run starts with an unchanged lockfile
- THEN the install step restores dependencies from cache instead of downloading them from the registry

#### Scenario: Cache is invalidated on lockfile change

- GIVEN the `pnpm-lock.yaml` changes between runs
- WHEN the workflow runs after that change
- THEN the install step does not reuse a cache keyed to the old lockfile and installs the updated dependency set

### Requirement: Pipeline Reflects Local Commands

The gates the workflow runs MUST be the same `test`, `lint`, and build/typecheck commands a developer can run locally via the root `package.json`/turbo scripts (see `dev-tooling`), so a green local run reliably predicts a green CI run.

#### Scenario: Local commands mirror CI

- GIVEN a developer runs `pnpm lint`, `pnpm test`, and the build command locally and all pass
- WHEN the same commit is pushed and CI runs
- THEN CI invokes the same underlying commands and produces the same pass/fail outcome (absent environment-specific flakiness)
