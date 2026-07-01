import { describe, expect, it, vi } from "vitest";
import {
  CodeGenerationExhaustedError,
  InvalidUrlError,
} from "../domain/errors";
import { ShortCode } from "../domain/short-code";
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

    await expect(useCase.execute("not a url")).rejects.toThrow(InvalidUrlError);
    expect(findByHashSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("re-throws a non-collision repository error instead of retrying", async () => {
    const { useCase, repository } = buildUseCase();
    const connectionError = new Error("connection to database lost");
    const createSpy = vi
      .spyOn(repository, "create")
      .mockRejectedValue(connectionError);

    await expect(useCase.execute("https://example.com/a")).rejects.toBe(
      connectionError,
    );
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a P2002 unique-constraint error as a collision and retries", async () => {
    const { useCase, repository } = buildUseCase();
    const p2002Error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    const createSpy = vi
      .spyOn(repository, "create")
      .mockRejectedValueOnce(p2002Error)
      .mockImplementation((input) =>
        InMemoryUrlRepository.prototype.create.call(repository, input),
      );

    const result = await useCase.execute("https://example.com/a");

    expect(result.code).toHaveLength(7);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("converges through the real fake when the generator produces a colliding code first", async () => {
    const repository = new InMemoryUrlRepository();
    await repository.create({
      code: "DupeCod",
      longUrl: "https://example.com/already-taken",
      urlHash: "hash-taken",
    });

    const generator = new ShortCodeGenerator(repository);
    const realGenerate = generator.generate.bind(generator);
    const generateSpy = vi
      .spyOn(generator, "generate")
      .mockImplementationOnce(async () => ShortCode.create("DupeCod"))
      .mockImplementation(realGenerate);

    const useCase = new ShortenUrlUseCase(repository, generator);

    const result = await useCase.execute("https://example.com/new-url");

    expect(result.code).not.toBe("DupeCod");
    expect(result.code).toHaveLength(7);
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });

  it("throws CodeGenerationExhaustedError when every create attempt collides on code", async () => {
    const { useCase, repository } = buildUseCase();
    const p2002Error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    const createSpy = vi
      .spyOn(repository, "create")
      .mockRejectedValue(p2002Error);
    const findByHashSpy = vi
      .spyOn(repository, "findByHash")
      .mockResolvedValue(null);

    await expect(useCase.execute("https://example.com/a")).rejects.toThrow(
      CodeGenerationExhaustedError,
    );
    // First findByHash call is the initial existing-URL lookup; the rest are
    // the per-attempt race re-checks inside the retry loop.
    expect(findByHashSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(5);
  });
});
