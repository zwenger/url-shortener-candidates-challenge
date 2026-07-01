import { describe, expect, it } from "vitest";
import { BlockedHostError, InvalidUrlError } from "./errors";
import { LongUrl } from "./long-url";

describe("LongUrl", () => {
  it("lowercases scheme and host, strips default https port", () => {
    const longUrl = LongUrl.create("HTTPS://Example.COM:443/Path?x=1");

    expect(longUrl.value).toBe("https://example.com/Path?x=1");
  });

  it("lowercases scheme and host, strips default http port", () => {
    const longUrl = LongUrl.create("HTTP://Example.COM:80/Path?x=1");

    expect(longUrl.value).toBe("http://example.com/Path?x=1");
  });

  it("strips the fragment while preserving path and query", () => {
    const longUrl = LongUrl.create("https://example.com/Path?x=1#section");

    expect(longUrl.value).toBe("https://example.com/Path?x=1");
  });

  it("preserves a non-default port", () => {
    const longUrl = LongUrl.create("https://example.com:8443/a");

    expect(longUrl.value).toBe("https://example.com:8443/a");
  });

  it("preserves path and query casing and does not sort params or strip trailing slash", () => {
    const longUrl = LongUrl.create("https://example.com/Path/?b=2&a=1");

    expect(longUrl.value).toBe("https://example.com/Path/?b=2&a=1");
  });

  it("does not strip a www. prefix", () => {
    const longUrl = LongUrl.create("https://WWW.example.com/a");

    expect(longUrl.value).toBe("https://www.example.com/a");
  });

  it("rejects malformed input with InvalidUrlError", () => {
    expect(() => LongUrl.create("not a url")).toThrow(InvalidUrlError);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "ftp://x",
    "vbscript:x",
  ])("rejects a non-http(s) scheme with InvalidUrlError: %s", (raw) => {
    expect(() => LongUrl.create(raw)).toThrow(InvalidUrlError);
  });

  it.each([
    // IPv4 private/loopback/link-local/metadata
    "http://10.0.0.5/",
    "http://10.255.255.255/",
    "http://172.16.4.4/",
    "http://172.31.255.255/",
    "http://192.168.0.1/",
    "http://192.168.255.255/",
    "http://127.0.0.1/",
    "http://127.255.255.255/",
    "http://169.254.169.254/",
    "http://0.0.0.0/",
    // IPv6 loopback/unspecified/unique-local/link-local
    "http://[::1]/",
    "http://[::]/",
    "http://[fc00::1]/",
    "http://[fdff::1]/",
    "http://[fe80::1]/",
    // IPv4-mapped IPv6
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:10.0.0.5]/",
    // localhost
    "http://localhost/",
    "http://localhost:3000/",
    "https://LOCALHOST/",
  ])("rejects a blocked host with BlockedHostError: %s", (raw) => {
    expect(() => LongUrl.create(raw)).toThrow(BlockedHostError);
  });

  it("accepts a well-formed public https URL (no regression)", () => {
    const longUrl = LongUrl.create("https://example.com/path");

    expect(longUrl.value).toBe("https://example.com/path");
  });

  it("still rejects a non-http(s) scheme with InvalidUrlError, unaffected by the host check", () => {
    expect(() => LongUrl.create("ftp://example.com/file")).toThrow(
      InvalidUrlError,
    );
  });

  it("exposes a SHA-256 hex hash of the normalized value", () => {
    const a = LongUrl.create("HTTPS://Example.COM:443/a");
    const b = LongUrl.create("https://example.com/a");

    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different normalized values", () => {
    const a = LongUrl.create("https://example.com/a");
    const b = LongUrl.create("https://example.com/b");

    expect(a.hash).not.toBe(b.hash);
  });
});
