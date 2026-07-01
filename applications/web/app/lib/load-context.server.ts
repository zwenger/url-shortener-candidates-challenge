/**
 * Augments React Router's `AppLoadContext` (an intentionally-empty
 * interface, see the react-router package) so route loaders/actions get a
 * typed `clientIp`, set by `server.ts`'s `getLoadContext(req)`, and
 * `entry.server.tsx` gets a typed per-request CSP `nonce`, set by the
 * `securityHeaders` middleware and forwarded via `getLoadContext(req, res)`.
 */
declare module "react-router" {
  interface AppLoadContext {
    clientIp?: string;
    nonce?: string;
  }
}

/**
 * Reads the client IP from the RR load context, falling back to a stable
 * placeholder key when absent (e.g. in tests that don't wire a context, or
 * if this ever runs outside the custom Express server).
 */
export function clientIpFrom(context: unknown): string {
  if (
    context &&
    typeof context === "object" &&
    "clientIp" in context &&
    typeof (context as { clientIp?: unknown }).clientIp === "string"
  ) {
    return (context as { clientIp: string }).clientIp;
  }
  return "unknown";
}
