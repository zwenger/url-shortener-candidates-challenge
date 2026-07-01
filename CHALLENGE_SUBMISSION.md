# Submission

## What I Did

Rebuilt the intentionally-flawed starter into a production-quality URL shortener, delivered as five independently-reviewed vertical slices (each with its own PR):

- **Architecture** — Restructured `libs/engine` into a light **hexagonal** design (domain / application / infrastructure). The domain has zero infrastructure dependencies; a `createEngine()` composition root wires the adapters and lets tests inject fakes. New behaviour (stats, caching, security) was added by extending ports and decorating adapters, never by touching the domain contracts.
- **Persistence** — Prisma + SQLite behind a `UrlRepository` port. Migrations apply automatically on container start; data survives restarts (named Docker volume). Short codes use **base62** with collision-safe generation (unique constraint + bounded retry). Shortening is **idempotent** via a SHA-256 hash of the conservatively-normalized URL.
- **Click statistics** — Click recording on redirect is **best-effort / non-blocking**: the 302 is never delayed or failed by a stats write. A listing read-model backs the `/urls` view.
- **Caching** — An in-process **LRU cache-aside decorator** over the repository for the read-heavy redirect path; it caches only the immutable target (so click counts are never served stale) and degrades gracefully to the DB.
- **Security & abuse prevention** — Per-IP **token-bucket rate limiting** (a small custom Express server exposes the real client IP), an **SSRF host denylist** (private/loopback/link-local/metadata, incl. NAT64/6to4/IPv4-mapped forms, via `ipaddr.js`), an `http/https` scheme allowlist, a **CSP with a per-request nonce**, and baseline security headers.
- **UI** — A clean, **mobile-first** interface with shadcn/ui components and Kanagawa theming (light/dark, no flash-of-unstyled-content), inline error feedback and loading states on the shorten form, and a `/urls` card list with statistics.
- **Quality gates** — **215 tests** (unit, integration against a real SQLite DB, and route/e2e), strict TDD from the domain slice onward; GitHub Actions CI (lint → typecheck → test → build); Biome for lint/format; Node 24.

**What I prioritized and why:** depth over breadth. A URL shortener is small enough that the interesting signal is *how* it's built — clean boundaries, real tests, honest security, and a working Docker deployment — not the feature count. So I invested in a well-architected, adversarially-reviewed core and documented the rest as a roadmap below.

## What I Would Do With More Time

- Add authentication and scope the `/urls` listing per authenticated user. It is currently public and unscoped (single-tenant demo, no auth model in scope for this challenge) — see README "Security & Deployment Notes".
- **Resolve-time SSRF protection** — the current static host/IP check does not catch a public hostname that resolves to a private IP (DNS rebinding).
- **Redis-backed rate limiter and cache** for multi-instance deployments — both are currently in-process and reset on restart.
- **Pagination** on the listing (currently capped at a fixed number of rendered rows).
- **Observability** — structured logging, metrics, and error tracking (e.g. Sentry); today failures are console-level only.
- Deeper analytics (referrers, time-series), custom aliases, and URL expiration/TTL.

## AI Usage

This was built with heavy AI assistance, used deliberately as an engineering process rather than as a code generator.

- **Spec-Driven Development per slice** — each slice ran proposal → spec → design → tasks → implement → verify. Architecture and product tradeoffs were surfaced as explicit questions and **I made every decision** (DB choice, hexagonal boundaries, what to cache, rate-limit strategy, theming, scope cuts). AI executed the implementation and tests under that direction.
- **Adversarial multi-agent review on every slice** — after implementation, a blind dual review plus four specialized reviewers (security / resilience / readability / reliability) ran in parallel; only findings confirmed by consensus were fixed and then re-verified. This caught real issues that unit tests and manual smoke tests missed — e.g. a CSP policy that would have blocked React hydration, SSRF bypasses via NAT64/6to4 IPv6 embeddings, and an SSR crash from reading `document` during server render.
- **Everything was verified for real**, not just generated: every slice was exercised end-to-end in Docker (shorten → redirect → stats, rate-limit 429, SSRF 400, restart-survival).

Example prompts / directions I gave: *"the UI has to be mobile-first — most people manage this from a phone"*; *"Node 20 is EOL, we can't ship on it"*; *"use ipaddr.js — hand-rolled IPv6 parsing keeps producing bypasses"*; *"caching must never serve a stale click count."*

## Feedback

Clear and well-designed. The intentionally-broken starter with an explicit requirements list makes prioritization decisions obvious and reviewable, and "run it on Docker" is a good forcing function for real correctness. The main tension is the ~2-hour suggestion versus the depth the problem invites (architecture, tests, security, a real UI) — worth stating explicitly whether you're optimizing for a tight time-box or for demonstrated engineering depth, since they pull in different directions.
