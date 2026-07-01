import { describe, expect, it } from "vitest";
import { InMemoryUrlRepository } from "./in-memory-url-repository";

describe("InMemoryUrlRepository", () => {
  it("returns null from findByCode when nothing is stored", async () => {
    const repo = new InMemoryUrlRepository();

    expect(await repo.findByCode("missing")).toBeNull();
  });

  it("returns null from findByHash when nothing is stored", async () => {
    const repo = new InMemoryUrlRepository();

    expect(await repo.findByHash("missing")).toBeNull();
  });

  it("creates a record and finds it by code and by hash", async () => {
    const repo = new InMemoryUrlRepository();

    const created = await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    expect(created.code).toBe("AbC1234");
    expect(await repo.findByCode("AbC1234")).toEqual(created);
    expect(await repo.findByHash("hash-a")).toEqual(created);
  });

  it("reports existsByCode correctly", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    expect(await repo.existsByCode("AbC1234")).toBe(true);
    expect(await repo.existsByCode("zzzzzzz")).toBe(false);
  });

  it("throws on duplicate code, mimicking a unique-constraint violation", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await expect(
      repo.create({
        code: "AbC1234",
        longUrl: "https://example.com/b",
        urlHash: "hash-b",
      }),
    ).rejects.toThrow();
  });

  it("throws on duplicate urlHash, mimicking a unique-constraint violation", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await expect(
      repo.create({
        code: "zzzzzzz",
        longUrl: "https://example.com/a-again",
        urlHash: "hash-a",
      }),
    ).rejects.toThrow();
  });

  it("carries a P2002-shaped code and meta.target on duplicate code, matching Prisma's contract", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await expect(
      repo.create({
        code: "AbC1234",
        longUrl: "https://example.com/b",
        urlHash: "hash-b",
      }),
    ).rejects.toMatchObject({
      code: "P2002",
      meta: { target: ["code"] },
    });
  });

  it("carries a P2002-shaped code and meta.target on duplicate urlHash, matching Prisma's contract", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await expect(
      repo.create({
        code: "zzzzzzz",
        longUrl: "https://example.com/a-again",
        urlHash: "hash-a",
      }),
    ).rejects.toMatchObject({
      code: "P2002",
      meta: { target: ["urlHash"] },
    });
  });

  it("defaults a freshly created record to clickCount 0 and lastClickedAt null", async () => {
    const repo = new InMemoryUrlRepository();

    const created = await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    expect(created.clickCount).toBe(0);
    expect(created.lastClickedAt).toBeNull();
  });

  it("increments clickCount and sets lastClickedAt on incrementClicks", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await repo.incrementClicks("AbC1234");
    const found = await repo.findByCode("AbC1234");

    expect(found?.clickCount).toBe(1);
    expect(found?.lastClickedAt).toBeInstanceOf(Date);
  });

  it("compounds repeated increments", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    await repo.incrementClicks("AbC1234");
    await repo.incrementClicks("AbC1234");
    await repo.incrementClicks("AbC1234");
    const found = await repo.findByCode("AbC1234");

    expect(found?.clickCount).toBe(3);
  });

  it("throws a P2025-shaped error when incrementClicks targets a missing code, matching Prisma's contract", async () => {
    const repo = new InMemoryUrlRepository();

    await expect(repo.incrementClicks("zzzzzzz")).rejects.toMatchObject({
      code: "P2025",
    });
  });

  it("returns an empty array from listAll when nothing is stored", async () => {
    const repo = new InMemoryUrlRepository();

    expect(await repo.listAll()).toEqual([]);
  });

  it("returns all records from listAll ordered by createdAt descending", async () => {
    const repo = new InMemoryUrlRepository();
    const first = await repo.create({
      code: "First01",
      longUrl: "https://example.com/first",
      urlHash: "hash-first",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    const second = await repo.create({
      code: "Second1",
      longUrl: "https://example.com/second",
      urlHash: "hash-second",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    const third = await repo.create({
      code: "Third001",
      longUrl: "https://example.com/third",
      urlHash: "hash-third",
    });

    const all = await repo.listAll();

    expect(all.map((url) => url.code)).toEqual([
      third.code,
      second.code,
      first.code,
    ]);
  });

  it("listAll does not mutate the internal storage order", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({
      code: "First01",
      longUrl: "https://example.com/first",
      urlHash: "hash-first",
    });
    await repo.create({
      code: "Second1",
      longUrl: "https://example.com/second",
      urlHash: "hash-second",
    });

    await repo.listAll();
    const secondCall = await repo.listAll();

    expect(secondCall).toHaveLength(2);
  });
});
