import { createHash } from "node:crypto";
import { InvalidUrlError } from "./errors";

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

function normalize(raw: string): string {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidUrlError(raw);
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
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
