import { createHash } from "node:crypto";
import { BlockedHostError, InvalidUrlError } from "./errors";

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// SSRF hardening: static (no DNS) rejection of hostnames that point at
// private/loopback/link-local/metadata addresses. DNS-rebinding (a public
// name that later resolves to a private IP) is a documented, accepted
// residual risk — see design.md.

function parseIpv4(hostname: string): number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) {
    return undefined;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return undefined;
  }
  return octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local/metadata)
  if (a === 0) return true; // 0.0.0.0/8

  return false;
}

function isBlockedIpv6(rawHostname: string): boolean {
  // WHATWG URL keeps the brackets in `hostname` for IPv6 literals and
  // canonicalizes IPv4-mapped addresses (::ffff:127.0.0.1) into pure hex
  // hextets (::ffff:7f00:1), so normalize both before matching.
  const lower = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (lower === "::1" || lower === "::") {
    return true; // loopback / unspecified
  }

  // IPv4-mapped IPv6 (::ffff:x:y, where x:y is the IPv4 address as two hex
  // hextets) — decode back to dotted-decimal and evaluate as IPv4.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (mapped) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    const octets = [high >> 8, high & 0xff, low >> 8, low & 0xff];
    return isBlockedIpv4(octets);
  }

  const firstHextet = Number.parseInt(lower.split(":")[0] || "0", 16);

  // fc00::/7 (unique local): first 7 bits are 1111 110x -> first hextet
  // 0xfc00-0xfdff.
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
    return true;
  }

  // fe80::/10 (link-local): first hextet 0xfe80-0xfebf.
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
    return true;
  }

  return false;
}

function isBlockedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }

  const ipv4Octets = parseIpv4(hostname);
  if (ipv4Octets) {
    return isBlockedIpv4(ipv4Octets);
  }

  if (hostname.startsWith("[") || hostname.includes(":")) {
    return isBlockedIpv6(hostname);
  }

  return false;
}

function normalize(raw: string): string {
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

  return parsed.toString();
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
