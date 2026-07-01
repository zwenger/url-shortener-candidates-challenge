/**
 * Parses the `TRUST_PROXY` env var into an Express `trust proxy` setting.
 *
 * Express's `trust proxy` accepts a boolean, a numeric hop count, or a
 * comma-separated list of IP/CIDR ranges. A bare `true` trusts every hop in
 * `X-Forwarded-For`, including ones an attacker fully controls when there is
 * no proxy in front of the app (or fewer proxies than assumed) — this lets a
 * client spoof its own IP and bypass the per-IP rate limiter entirely. This
 * parser only ever returns a numeric hop count or an explicit IP/CIDR list,
 * never a boolean `true`, and defaults to `false` (no trust) when unset.
 */
export function parseTrustProxy(
  value: string | undefined,
): number | string | boolean {
  if (!value || value.trim() === "") {
    return false;
  }

  const trimmed = value.trim();
  const asNumber = Number(trimmed);

  if (Number.isInteger(asNumber) && String(asNumber) === trimmed) {
    return asNumber;
  }

  // Comma-separated IP/CIDR list — passed through as-is for Express's
  // built-in proxy-address parsing.
  return trimmed;
}
