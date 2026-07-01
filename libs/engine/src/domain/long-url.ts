import { createHash } from "node:crypto";
import ipaddr from "ipaddr.js";
import { BlockedHostError, InvalidUrlError } from "./errors";

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// Upper bound applied to the NORMALIZED (percent-encoded) value — the string
// actually stored and hashed — not just the raw input. 2048 is the classic
// de-facto browser URL limit (older IE, and still the safe interoperable
// ceiling); anything longer is far more likely to be abuse/garbage than a
// legitimate link, and bounding the normalized form keeps the unbounded
// `longUrl` column and downstream processing from being fed arbitrarily large
// strings even when a short unicode input expands massively on encoding.
export const MAX_URL_LENGTH = 2048;

// SSRF hardening: static (no DNS) rejection of hostnames that point at
// private/loopback/link-local/metadata addresses. DNS-rebinding (a public
// name that later resolves to a private IP) is a documented, accepted
// residual risk — see design.md.
//
// IP classification is delegated to ipaddr.js rather than hand-rolled range
// matching: a prior hand-rolled matcher missed IPv6 address-embedding forms
// (NAT64/RFC6052, 6to4/RFC3056, SIIT/RFC6145) that smuggle a blocked IPv4
// address (e.g. the cloud-metadata IP 169.254.169.254) inside an IPv6
// literal that superficially looks unremarkable.

const BLOCKED_IPV4_RANGES = new Set([
  "private",
  "loopback",
  "linkLocal",
  "carrierGradeNat",
  "reserved",
  "unspecified",
  "broadcast",
]);

const BLOCKED_IPV6_RANGES = new Set([
  "loopback",
  "linkLocal",
  "uniqueLocal",
  "unspecified",
  "reserved",
]);

// IPv6 ranges that embed an IPv4 address which must be classified in its own
// right (an outer "safe-looking" IPv6 range can still smuggle a blocked
// IPv4 target). `ipaddr.js`'s `toIPv4Address()` only decodes the classic
// `ipv4Mapped` form (::ffff:a.b.c.d); rfc6052 (NAT64) and 6to4 embed the
// IPv4 address at a different bit offset, so those are decoded manually via
// the raw byte array.
const IPV4_EMBEDDING_RANGES = new Set([
  "ipv4Mapped",
  "rfc6052",
  "rfc6145",
  "6to4",
]);

function extractEmbeddedIpv4(address: ipaddr.IPv6): ipaddr.IPv4 | undefined {
  const range = address.range();

  if (range === "ipv4Mapped") {
    return address.toIPv4Address();
  }

  if (range === "rfc6052" || range === "rfc6145") {
    // 64:ff9b::/96 (NAT64) and ::ffff:0:0/96 (SIIT) both embed the IPv4
    // address in the last 32 bits.
    return new ipaddr.IPv4(address.toByteArray().slice(-4));
  }

  if (range === "6to4") {
    // 2002::/16 embeds the IPv4 address immediately after the 16-bit
    // prefix (bytes 2-5 of the 16-byte address).
    return new ipaddr.IPv4(address.toByteArray().slice(2, 6));
  }

  return undefined;
}

function isBlockedIp(address: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  if (address.kind() === "ipv4") {
    return BLOCKED_IPV4_RANGES.has(address.range());
  }

  const ipv6 = address as ipaddr.IPv6;
  const range = ipv6.range();

  if (BLOCKED_IPV6_RANGES.has(range)) {
    return true;
  }

  if (IPV4_EMBEDDING_RANGES.has(range)) {
    const embedded = extractEmbeddedIpv4(ipv6);
    return embedded ? BLOCKED_IPV4_RANGES.has(embedded.range()) : false;
  }

  return false;
}

function isBlockedHost(rawHostname: string): boolean {
  // Strip a single trailing dot (the DNS root label — "localhost." and
  // "localhost" are the same name) before any comparison.
  const hostname = rawHostname.endsWith(".")
    ? rawHostname.slice(0, -1)
    : rawHostname;
  const lower = hostname.toLowerCase();

  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return true;
  }

  // WHATWG URL keeps brackets around an IPv6 literal in `.hostname`.
  const unbracketed = lower.replace(/^\[|\]$/g, "");

  if (!ipaddr.isValid(unbracketed)) {
    return false; // Not an IP literal — a real domain name, no DNS lookup.
  }

  return isBlockedIp(ipaddr.parse(unbracketed));
}

function normalize(raw: string): string {
  // Cheap early reject: the normalized value is always at least as long as
  // the raw input (percent-encoding only grows it), so a raw string already
  // over the cap can never come back under it — bail before parsing.
  if (raw.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError(raw);
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidUrlError(raw);
  }

  parsed.protocol = parsed.protocol.toLowerCase();

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new InvalidUrlError(raw);
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  if (isBlockedHost(parsed.hostname)) {
    throw new BlockedHostError(parsed.hostname);
  }

  parsed.hash = "";

  if (parsed.port === DEFAULT_PORTS[parsed.protocol]) {
    parsed.port = "";
  }

  const normalized = parsed.toString();

  // Authoritative bound: enforce the cap on the NORMALIZED value — the string
  // actually stored and hashed. WHATWG percent-encoding can expand a
  // unicode-heavy path/query far beyond its raw length, so a raw-only check
  // would let ~2KB of unicode balloon into tens of KB in storage.
  if (normalized.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError(raw);
  }

  return normalized;
}

function hashOf(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

export class LongUrl {
  private constructor(
    public readonly value: string,
    public readonly hash: string,
  ) {}

  static create(raw: string): LongUrl {
    const normalized = normalize(raw);

    return new LongUrl(normalized, hashOf(normalized));
  }
}
