import { describe, expect, it, vi } from "vitest";
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

  it("throws UrlNotFoundError (not a crash) for an empty code", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new ResolveUrlUseCase(repository);

    await expect(useCase.execute("")).rejects.toThrow(UrlNotFoundError);
  });

  it("throws UrlNotFoundError (not a crash) for a malformed non-base62 code", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new ResolveUrlUseCase(repository);

    await expect(useCase.execute("../../etc/passwd")).rejects.toThrow(
      UrlNotFoundError,
    );
  });

  it("throws UrlNotFoundError (not a crash) for an oversized code", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new ResolveUrlUseCase(repository);
    const oversized = "A".repeat(5000);

    await expect(useCase.execute(oversized)).rejects.toThrow(UrlNotFoundError);
  });

  it("does not query the repository for an invalid code", async () => {
    const repository = new InMemoryUrlRepository();
    const findByCodeSpy = vi.spyOn(repository, "findByCode");
    const useCase = new ResolveUrlUseCase(repository);

    await expect(useCase.execute("not valid!")).rejects.toThrow(
      UrlNotFoundError,
    );
    expect(findByCodeSpy).not.toHaveBeenCalled();
  });
});
