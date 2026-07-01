import type { NextFunction, Request, Response } from "express";

// Minimal CSP: Tailwind injects inline <style> (hence style-src
// 'unsafe-inline'), while React Router's hydration script is a regular
// same-origin <script src>, so script-src stays default (no
// 'unsafe-inline' needed there). Nonces are deferred — see design.md.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Baseline security-response-headers middleware, applied to every response
 * (documents, redirects, and thrown/error responses alike) by the custom
 * Express server in `server.ts` — the single point every response passes
 * through, so this covers the whole app without a second mechanism (e.g. a
 * per-route `headers` export, which would miss error/redirect responses).
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
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
