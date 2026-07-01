import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "@react-router/express";
import express, { type Express, type RequestHandler } from "express";
import type { AppLoadContext, ServerBuild } from "react-router";
import {
  type SecurityHeadersLocals,
  securityHeaders,
} from "./app/lib/security-headers.server.ts";
import { parseTrustProxy } from "./app/lib/trust-proxy.server.ts";
import "./app/lib/load-context.server.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_PATH = path.join(__dirname, "build", "server", "index.js");
const CLIENT_ASSETS_PATH = path.join(__dirname, "build", "client");

export interface CreateAppOptions {
  /** Raw `TRUST_PROXY` env value; parsed via `parseTrustProxy`. */
  trustProxyEnv?: string;
  /**
   * The request handler mounted for all non-static routes — the real React
   * Router request handler in production, or a trivial stub in tests so
   * they don't need a real RR build. Defaults to the real
   * `createRequestHandler({ build, getLoadContext })`.
   */
  requestHandler?: RequestHandler;
  /**
   * Test-only hook invoked with every `AppLoadContext` produced by
   * `getLoadContext`, so tests can assert on `clientIp`/`nonce` without a
   * real downstream route handler.
   */
  onLoadContext?: (context: AppLoadContext) => void;
}

/**
 * Builds the Express app: security headers (incl. per-request CSP nonce) on
 * every response, `trust proxy` resolved from `TRUST_PROXY` (never a bare
 * boolean — see `trust-proxy.server.ts`), static asset serving, and the
 * React Router request handler with a load context exposing the real
 * client IP and the CSP nonce. Extracted into a factory (rather than
 * top-level side effects) so it can be exercised by an integration test
 * without booting a real HTTP listener against a real RR build.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");

  // Gated by TRUST_PROXY so `req.ip` is the true socket address by default
  // (not spoofable via X-Forwarded-For) and only honors the header when a
  // trusted proxy is explicitly configured in front of this server, via a
  // numeric hop count or explicit IP/CIDR list — never a bare `true`,
  // which would trust every hop and let a client spoof its own IP.
  app.set("trust proxy", parseTrustProxy(options.trustProxyEnv));

  app.use(securityHeaders);

  app.use(
    "/assets",
    express.static(path.join(CLIENT_ASSETS_PATH, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(express.static(CLIENT_ASSETS_PATH, { maxAge: "1h" }));

  function buildLoadContext(
    req: express.Request,
    res: express.Response,
  ): AppLoadContext {
    // Exposes the real client IP (socket address, or X-Forwarded-For when
    // TRUST_PROXY is set) and the per-request CSP nonce (set by
    // `securityHeaders` on `res.locals`) to route loaders/actions and to
    // `entry.server.tsx` via the RR load context.
    const locals = res.locals as SecurityHeadersLocals;
    const context: AppLoadContext = {
      clientIp: req.ip,
      nonce: locals.nonce,
    };
    options.onLoadContext?.(context);
    return context;
  }

  const requestHandler =
    options.requestHandler ??
    createRequestHandler({
      build: () => import(BUILD_PATH) as Promise<ServerBuild>,
      getLoadContext: buildLoadContext,
    });

  if (options.requestHandler) {
    // Stub request handlers (used in tests) don't call getLoadContext
    // themselves, but the context-building/onLoadContext contract is part
    // of what this factory guarantees regardless of which handler is
    // mounted, so build it here too.
    app.use((req, res, next) => {
      buildLoadContext(req, res);
      next();
    });
  }

  app.all("*splat", requestHandler);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp({ trustProxyEnv: process.env.TRUST_PROXY });
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`[web] listening on http://localhost:${port}`);
  });

  // Graceful shutdown: stop accepting new connections and let in-flight
  // requests finish, so a deploy/restart doesn't drop them mid-response.
  // Node is PID 1 inside the container (the Dockerfile CMD runs `node
  // server.ts` directly, no `pnpm` wrapper in between), so it receives
  // these signals directly from the container runtime.
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`[web] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // Force-exit if connections don't drain in time (e.g. a stuck
    // keep-alive), so shutdown never hangs indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
