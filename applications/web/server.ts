import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import type { AppLoadContext, ServerBuild } from "react-router";
import "./app/lib/load-context.server.ts";

// Security headers are applied here, as Express middleware, rather than in
// entry.server.tsx: this custom server already exists for client-IP
// resolution (see below), so a single middleware covers every response
// (documents, redirects, thrown errors) without a second mechanism.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Tailwind injects inline <style>; React Router's hydration script is a
  // regular same-origin <script src>, so `script-src` stays default (no
  // 'unsafe-inline' needed there). Nonces are deferred — see design.md.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }
  next();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_PATH = path.join(__dirname, "build", "server", "index.js");
const CLIENT_ASSETS_PATH = path.join(__dirname, "build", "client");

const app = express();
app.disable("x-powered-by");

// Gated by TRUST_PROXY so `req.ip` is the true socket address by default
// (not spoofable via X-Forwarded-For) and only honors the header when a
// trusted proxy is explicitly configured in front of this server.
app.set("trust proxy", process.env.TRUST_PROXY === "true");

app.use(securityHeaders);

app.use(
  "/assets",
  express.static(path.join(CLIENT_ASSETS_PATH, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static(CLIENT_ASSETS_PATH, { maxAge: "1h" }));

app.all(
  "*splat",
  createRequestHandler({
    build: () => import(BUILD_PATH) as Promise<ServerBuild>,
    getLoadContext(req): AppLoadContext {
      // Exposes the real client IP (socket address, or X-Forwarded-For when
      // TRUST_PROXY is set) to route loaders/actions via the RR load
      // context, so the shorten action can key the rate limiter on it.
      return { clientIp: req.ip };
    },
  }),
);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[web] listening on http://localhost:${port}`);
});
