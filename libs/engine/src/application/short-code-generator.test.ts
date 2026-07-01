import { describe, expect, it, vi } from "vitest";
import { CodeGenerationExhaustedError } from "../domain/errors";
import { InMemoryUrlRepository } from "../test-support/in-memory-url-repository";
import { ShortCodeGenerator } from "./short-code-generator";

describe("ShortCodeGenerator", () => {
  it("generates a base62 code of the default length (7) on the first try", async () => {
    const repo = new InMemoryUrlRepository();
    const generator = new ShortCodeGenerator(repo);

    const code = await generator.generate();

    expect(code.value).toHaveLength(7);
    expect(code.value).toMatch(/^[A-Za-z0-9]{7}$/);
  });

  it("honors an explicit length argument (no env reads)", async () => {
    const repo = new InMemoryUrlRepository();
    // The generator must not read process.env; length is injected by the
    // composition root. Setting the env var here proves it is ignored.
    vi.stubEnv("SHORT_CODE_LENGTH", "3");
    const generator = new ShortCodeGenerator(repo, 10);

    const code = await generator.generate();

    expect(code.value).toHaveLength(10);
    vi.unstubAllEnvs();
  });

  it("retries transparently on a single collision and succeeds", async () => {
    const repo = new InMemoryUrlRepository();
    const existsByCode = vi
      .spyOn(repo, "existsByCode")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const generator = new ShortCodeGenerator(repo);

    const code = await generator.generate();

    expect(code.value).toHaveLength(7);
    expect(existsByCode).toHaveBeenCalledTimes(2);
  });

  it("throws CodeGenerationExhaustedError after exhausting bounded retries", async () => {
    const repo = new InMemoryUrlRepository();
    vi.spyOn(repo, "existsByCode").mockResolvedValue(true);
    const generator = new ShortCodeGenerator(repo);

    await expect(generator.generate()).rejects.toThrow(
      CodeGenerationExhaustedError,
    );
  });

  it("does not exceed the max attempts when retrying", async () => {
    const repo = new InMemoryUrlRepository();
    const existsByCode = vi.spyOn(repo, "existsByCode").mockResolvedValue(true);
    const generator = new ShortCodeGenerator(repo);

    await expect(generator.generate()).rejects.toThrow();
    expect(existsByCode).toHaveBeenCalledTimes(5);
  });
});
