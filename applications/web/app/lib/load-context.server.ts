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

export interface ClientIpResult {
  /** The resolved client IP, or `undefined` when it could not be determined. */
  ip: string | undefined;
  /**
   * `true` when the IP could not be determined and the caller should
   * fail open (bypass the rate limiter for this request) rather than key
   * it into a shared bucket. A shared `"unknown"` bucket would let any
   * client whose IP genuinely can't be resolved (or, worse, an attacker
   * who finds a way to reach this branch) either get rate-limited
   * alongside unrelated clients, or exhaust a bucket that then blocks
   * everyone else routed the same way — neither is the intended
   * behavior of a *per-IP* limiter. Missing IP resolution is treated as
   * an infrastructure gap to fix (hence the warning), not a client to
   * penalize.
   */
  failOpen: boolean;
}

/**
 * Reads the client IP from the RR load context. Returns `failOpen: true`
 * (and logs a warning) when the IP cannot be determined, instead of
 * funneling every such request into a shared placeholder key.
 */
export function clientIpFrom(context: unknown): ClientIpResult {
  if (
    context &&
    typeof context === "object" &&
    "clientIp" in context &&
    typeof (context as { clientIp?: unknown }).clientIp === "string"
  ) {
    return { ip: (context as { clientIp: string }).clientIp, failOpen: false };
  }

  console.warn("clientIpFrom: unable to resolve client IP, failing open");
  return { ip: undefined, failOpen: true };
}
