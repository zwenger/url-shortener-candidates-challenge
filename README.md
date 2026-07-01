# URL Shortener

## Tech Stack

```
url-shortener/
├── applications/web/    # React + React Router v7
└── libs/engine/         # Domain logic
```

| Technology                                    | Description                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [pnpm](https://pnpm.io/)                      | Fast, disk-efficient package manager with built-in monorepo support via workspaces                |
| [Turbo](https://turbo.build/)                 | High-performance build system for monorepos. Runs tasks in parallel and caches results            |
| [React](https://react.dev/)                   | Library for building user interfaces with components                                              |
| [React Router v7](https://reactrouter.com/)   | Full-stack React framework. Handles routing, data loading (loaders), mutations (actions), and SSR |
| [TypeScript](https://www.typescriptlang.org/) | Typed superset of JavaScript for catching errors at compile time                                  |
| [Tailwind CSS](https://tailwindcss.com/)      | Utility-first CSS framework for rapid UI development                                              |
| [Vite](https://vite.dev/)                     | Fast build tool and dev server with hot module replacement                                        |

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:5173`

## Docker Setup

```bash
docker-compose up --build
```

Open `http://localhost:3000`

## Security & Deployment Notes

- **This app is single-replica-only by design.** Two pieces of state live in
  process memory rather than a shared store, so they neither share nor
  survive across instances:
  - The token-bucket rate limiter
    (`applications/web/app/lib/rate-limit.server.ts`). Running N instances
    behind a load balancer means each enforces its own independent limit, so
    the effective limit becomes roughly `10 * N` requests/minute per IP, and
    a restart/redeploy clears all buckets.
  - The read-through URL cache
    (`libs/engine/src/infra/caching-url-repository.ts`). Each instance keeps
    its own LRU cache, so a hit on one instance is a miss on another, and all
    caches reset on restart.

  This is an accepted single-node tradeoff for the take-home scope.
  Horizontal scale-out requires moving both the rate-limit and cache state
  to a shared store (e.g. Redis) so the limit and cache are consistent
  across replicas.
- **`TRUST_PROXY` must only be set when a trusted, header-scrubbing reverse
  proxy sits in front of the app.** It controls whether `req.ip` (and
  therefore the rate limiter's key) honors the `X-Forwarded-For` header.
  Set it to a numeric hop count (e.g. `TRUST_PROXY=1`) or an explicit
  IP/CIDR allowlist — never leave it unset behind an untrusted proxy chain,
  and never treat it as a plain on/off switch: an incorrectly configured
  value either lets any client spoof its IP and bypass the limiter, or
  (left unset behind a real proxy) makes every request appear to come from
  the proxy's own IP, collapsing everyone into one shared bucket. Default
  (unset) is no trust — the true socket IP is used.
- **SSRF protection is static-only; DNS rebinding is not covered.** The
  domain rejects known-bad hostnames and IP literals (including private,
  loopback, link-local, and cloud-metadata ranges, plus IPv6 forms that
  embed a blocked IPv4 address) at submission time, without a DNS lookup.
  A public hostname that resolves to a private/internal IP at *fetch* time
  (which this app does not currently perform against user-submitted URLs)
  would not be caught by this check alone.
- **The `/urls` listing is intentionally public, with no authentication.**
  This is a single-tenant demo — every shortened URL is visible to anyone
  who loads `/urls`, with no per-user ownership or access control. The
  challenge requires a listing-with-stats view and there is no auth model
  in scope, so this is an accepted deferral rather than an oversight. With
  more time, add authentication and scope the listing per authenticated
  user (each user only sees URLs they created).

## Known Limitations / Deferred Decisions

Conscious tradeoffs for the take-home scope, not oversights — each is a
deliberate choice with a clear path to production hardening:

- **Logging is unstructured (`console.*`) with no request-correlation IDs.**
  Errors and warnings go to stdout/stderr as plain messages. Production would
  use a structured logger (JSON) and thread a per-request correlation ID
  through loaders/actions and `handleError` so a single request's logs can be
  stitched together across the stack.
- **No `/healthz` readiness/liveness endpoint.** Orchestrators can only probe
  the app by hitting a real route. A dedicated health endpoint (checking DB
  connectivity) would be the first addition before running behind a real
  load balancer or Kubernetes.
- **The concurrent-shorten race is covered only via mocked P2002 injection.**
  The unique-constraint retry path is tested by mocking Prisma's P2002 error
  rather than a real `Promise.all` of concurrent submissions against a live
  DB. A true integration test that races real concurrent inserts is deferred.
- **Ordering tests depend on real `setTimeout` sleeps, not an injected clock.**
  Tests that assert newest-first ordering insert real delays between writes
  instead of injecting a controllable clock. This is slower and slightly
  flakier than a deterministic fake clock would be.
- **`ShortCode` has no domain-level length bound.** The code-length invariant
  lives in the generator (`ShortCodeGenerator`), not in the `ShortCode` value
  object, which only validates the base62 character set. A stricter domain
  model would move the length bound into `ShortCode` itself.
