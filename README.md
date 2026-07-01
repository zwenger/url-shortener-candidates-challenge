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

- **Rate limiting is per-instance, in-memory, and resets on restart.** The
  token-bucket limiter (`applications/web/app/lib/rate-limit.server.ts`)
  lives in process memory, not a shared store. Running multiple instances
  behind a load balancer means each instance enforces its own independent
  limit (effectively multiplying the real limit by the instance count), and
  a restart/redeploy clears all buckets. Use Redis (or similar) for a
  shared limiter if scaling beyond a single instance.
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
