import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * `res.locals` shape this middleware writes to. Declared as a standalone
 * type (rather than augmenting Express's global `Locals` interface, which
 * requires importing the internal `express-serve-static-core` module) and
 * consumed via a cast at the one call site that reads it back
 * (`server.ts`'s `getLoadContext`).
 */
export interface SecurityHeadersLocals {
  /**
   * Per-request CSP nonce, generated here and threaded through to
   * `entry.server.tsx` via `getLoadContext` so React Router's inline
   * hydration `<script>` tags carry the same nonce the
   * `Content-Security-Policy` header allows.
   */
  nonce?: string;
}

// Tailwind injects inline <style> (hence style-src 'unsafe-inline' — no
// viable per-request nonce for Tailwind's static stylesheet injection).
// script-src, however, uses a per-request nonce instead of 'unsafe-inline':
// React Router v7 emits several inline <script> blocks for hydration
// (scroll restoration, the route/loader-data payload, stream controllers),
// so a bare `default-src 'self'` (no script-src) would block all of them
// and silently break client-side hydration entirely — the page still
// "works" via full-page form submits, masking the bug from a quick smoke
// test. See `entry.server.tsx` for where the nonce is applied to the
// rendered output.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Baseline security-response-headers middleware, applied to every response
 * (documents, redirects, and thrown/error responses alike) by the custom
 * Express server in `server.ts` — the single point every response passes
 * through, so this covers the whole app without a second mechanism (e.g. a
 * per-route `headers` export, which would miss error/redirect responses).
 *
 * Also generates the per-request CSP nonce and stores it on `res.locals`
 * for `getLoadContext` to forward into the React Router load context.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const nonce = randomUUID();
  res.locals.nonce = nonce;

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", buildCsp(nonce));
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }
  next();
}
