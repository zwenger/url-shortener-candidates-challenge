import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit.server";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `capacity` requests for a single key", () => {
    const limiter = createRateLimiter({
      capacity: 3,
      refillPerSec: 1,
      now: Date.now,
    });

    expect(limiter.take("1.1.1.1")).toBe(true);
    expect(limiter.take("1.1.1.1")).toBe(true);
    expect(limiter.take("1.1.1.1")).toBe(true);
  });

  it("blocks the (capacity+1)th request for the same key", () => {
    const limiter = createRateLimiter({
      capacity: 3,
      refillPerSec: 1,
      now: Date.now,
    });

    limiter.take("1.1.1.1");
    limiter.take("1.1.1.1");
    limiter.take("1.1.1.1");

    expect(limiter.take("1.1.1.1")).toBe(false);
  });

  it("refills a token after enough time elapses", () => {
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: Date.now,
    });

    expect(limiter.take("1.1.1.1")).toBe(true);
    expect(limiter.take("1.1.1.1")).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(limiter.take("1.1.1.1")).toBe(true);
  });

  it("isolates buckets per key", () => {
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: Date.now,
    });

    expect(limiter.take("ip-a")).toBe(true);
    expect(limiter.take("ip-a")).toBe(false);

    // A different key must have its own, unexhausted bucket.
    expect(limiter.take("ip-b")).toBe(true);
  });

  it("still blocks when advanced just under the refill window (sub-window boundary)", () => {
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: Date.now,
    });

    expect(limiter.take("1.1.1.1")).toBe(true);
    expect(limiter.take("1.1.1.1")).toBe(false);

    // Just short of the full second needed to refill one token — must
    // still be blocked. A boundary bug (e.g. rounding up elapsed time,
    // or an off-by-one in the refill comparison) would let this succeed
    // early.
    vi.advanceTimersByTime(999);

    expect(limiter.take("1.1.1.1")).toBe(false);
  });

  it("accumulates fractional tokens across multiple sub-window advances", () => {
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: Date.now,
    });

    expect(limiter.take("1.1.1.1")).toBe(true);
    expect(limiter.take("1.1.1.1")).toBe(false);

    // Two 500ms advances (each refilling 0.5 tokens) must sum to exactly
    // one full token, not be truncated/discarded between calls — this
    // guards against an implementation that only tracks whole tokens or
    // resets fractional remainders on each refill call.
    vi.advanceTimersByTime(500);
    expect(limiter.take("1.1.1.1")).toBe(false);

    vi.advanceTimersByTime(500);
    expect(limiter.take("1.1.1.1")).toBe(true);
  });

  it("evicts the oldest entry once maxKeys is exceeded", () => {
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: Date.now,
      maxKeys: 2,
    });

    expect(limiter.take("ip-a")).toBe(true);
    expect(limiter.take("ip-a")).toBe(false); // ip-a bucket exhausted

    expect(limiter.take("ip-b")).toBe(true);
    expect(limiter.take("ip-b")).toBe(false); // ip-b bucket exhausted

    // Adding a third key evicts the oldest tracked key (ip-a). Its bucket
    // is now gone, so a fresh bucket is created and the request succeeds
    // even though the "old" ip-a bucket was exhausted.
    expect(limiter.take("ip-c")).toBe(true);

    // ip-a must have been evicted: requesting it again creates a brand
    // new full bucket instead of reusing the exhausted one.
    expect(limiter.take("ip-a")).toBe(true);
  });
});
