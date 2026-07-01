import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import type { AppLoadContext, ServerBuild } from "react-router";
import { securityHeaders } from "./app/lib/security-headers.server.ts";
import "./app/lib/load-context.server.ts";

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
