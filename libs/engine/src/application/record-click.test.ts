import { describe, expect, it } from "vitest";
import { InMemoryUrlRepository } from "../test-support/in-memory-url-repository";
import { RecordClickUseCase } from "./record-click";

describe("RecordClickUseCase", () => {
  it("increments the click count for a valid, existing code", async () => {
    const repository = new InMemoryUrlRepository();
    await repository.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });
    const useCase = new RecordClickUseCase(repository);

    await useCase.execute("AbC1234");
    const found = await repository.findByCode("AbC1234");

    expect(found?.clickCount).toBe(1);
    expect(found?.lastClickedAt).toBeInstanceOf(Date);
  });

  it("propagates a repository failure to the caller (best-effort handling is the caller's responsibility)", async () => {
    const repository = new InMemoryUrlRepository();
    await repository.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });
    repository.incrementClicks = () =>
      Promise.reject(new Error("simulated repository failure"));
    const useCase = new RecordClickUseCase(repository);

    await expect(useCase.execute("AbC1234")).rejects.toThrow(
      "simulated repository failure",
    );
  });

  it("does not call incrementClicks for a structurally invalid code", async () => {
    const repository = new InMemoryUrlRepository();
    let called = false;
    repository.incrementClicks = () => {
      called = true;
      return Promise.resolve();
    };
    const useCase = new RecordClickUseCase(repository);

    await expect(useCase.execute("not valid!")).resolves.toBeUndefined();
    expect(called).toBe(false);
  });

  it("propagates a missing-record error (P2025) to the caller", async () => {
    const repository = new InMemoryUrlRepository();
    const useCase = new RecordClickUseCase(repository);

    await expect(useCase.execute("zzzzzzz")).rejects.toMatchObject({
      code: "P2025",
    });
  });
});
