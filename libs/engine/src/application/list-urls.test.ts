import { describe, expect, it } from "vitest";
import { InMemoryUrlRepository } from "../test-support/in-memory-url-repository";
import { ListUrlsUseCase } from "./list-urls";

describe("ListUrlsUseCase", () => {
  it("returns an empty array for an empty repository", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new ListUrlsUseCase(repository);

    expect(await useCase.execute()).toEqual([]);
  });

  it("returns records ordered by createdAt descending for three staggered records", async () => {
    const repository = new InMemoryUrlRepository();
    const a = await repository.create({
      code: "AaaaAaa",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    const b = await repository.create({
      code: "BbbbBbb",
      longUrl: "https://example.com/b",
      urlHash: "hash-b",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    const c = await repository.create({
      code: "CcccCcc",
      longUrl: "https://example.com/c",
      urlHash: "hash-c",
    });
    const useCase = new ListUrlsUseCase(repository);

    const result = await useCase.execute();

    expect(result.map((url) => url.code)).toEqual([c.code, b.code, a.code]);
  });

  it("returns a never-clicked record with default clickCount 0 and lastClickedAt null", async () => {
    const repository = new InMemoryUrlRepository();
    await repository.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });
    const useCase = new ListUrlsUseCase(repository);

    const [result] = await useCase.execute();

    expect(result?.clickCount).toBe(0);
    expect(result?.lastClickedAt).toBeNull();
  });
});
