import { describe, expect, it } from "vitest";
import { UrlNotFoundError } from "../domain/errors";
import { InMemoryUrlRepository } from "../test-support/in-memory-url-repository";
import { ResolveUrlUseCase } from "./resolve-url";

describe("ResolveUrlUseCase", () => {
  it("returns the stored long URL for a known code", async () => {
    const repository = new InMemoryUrlRepository();
    await repository.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });
    const useCase = new ResolveUrlUseCase(repository);

    const result = await useCase.execute("AbC1234");

    expect(result.longUrl).toBe("https://example.com/a");
  });

  it("throws UrlNotFoundError for an unknown code", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new ResolveUrlUseCase(repository);

    await expect(useCase.execute("zzzzzzz")).rejects.toThrow(UrlNotFoundError);
  });
});
