import { describe, expect, it, vi } from "vitest";
import { InvalidUrlError } from "../domain/errors";
import { InMemoryUrlRepository } from "../test-support/in-memory-url-repository";
import { ShortCodeGenerator } from "./short-code-generator";
import { ShortenUrlUseCase } from "./shorten-url";

function buildUseCase(repository = new InMemoryUrlRepository()) {
  const generator = new ShortCodeGenerator(repository);
  return { useCase: new ShortenUrlUseCase(repository, generator), repository };
}

describe("ShortenUrlUseCase", () => {
  it("persists a new URL and returns a fresh code", async () => {
    const { useCase, repository } = buildUseCase();

    const result = await useCase.execute("https://example.com/a");

    expect(result.code).toHaveLength(7);
    expect(await repository.findByCode(result.code)).not.toBeNull();
  });

  it("returns the existing code without a new write when the same URL is submitted again", async () => {
    const { useCase, repository } = buildUseCase();
    const createSpy = vi.spyOn(repository, "create");

    const first = await useCase.execute("https://example.com/a");
    createSpy.mockClear();
    const second = await useCase.execute("https://example.com/a");

    expect(second.code).toBe(first.code);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("treats normalization-equivalent URLs as the same duplicate", async () => {
    const { useCase } = buildUseCase();

    const first = await useCase.execute("https://EXAMPLE.com:443/a");
    const second = await useCase.execute("https://example.com/a");

    expect(second.code).toBe(first.code);
  });

  it("throws InvalidUrlError before touching the repository for malformed input", async () => {
    const { useCase, repository } = buildUseCase();
    const createSpy = vi.spyOn(repository, "create");
    const findByHashSpy = vi.spyOn(repository, "findByHash");

    await expect(useCase.execute("not a url")).rejects.toThrow(
      InvalidUrlError,
    );
    expect(findByHashSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
