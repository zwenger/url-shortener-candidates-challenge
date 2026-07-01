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
});
