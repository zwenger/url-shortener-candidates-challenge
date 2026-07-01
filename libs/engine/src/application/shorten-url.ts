import { LongUrl } from "../domain/long-url";
import type { ShortenedUrl } from "../domain/shortened-url";
import type { UrlRepository } from "../domain/url-repository";
import type { ShortCodeGenerator } from "./short-code-generator";

const MAX_CREATE_ATTEMPTS = 5;

export class ShortenUrlUseCase {
  constructor(
    private readonly repository: UrlRepository,
    private readonly generator: ShortCodeGenerator,
  ) {}

  async execute(rawUrl: string): Promise<ShortenedUrl> {
    const longUrl = LongUrl.create(rawUrl);

    const existing = await this.repository.findByHash(longUrl.hash);
    if (existing) {
      return existing;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const code = await this.generator.generate();

      try {
        return await this.repository.create({
          code: code.value,
          longUrl: longUrl.value,
          urlHash: longUrl.hash,
        });
      } catch (error) {
        // Unique-constraint race: another request created a record with the
        // same hash (return it) or the same code (retry with a new code).
        lastError = error;
        const raced = await this.repository.findByHash(longUrl.hash);
        if (raced) {
          return raced;
        }
      }
    }

    throw lastError;
  }
}
