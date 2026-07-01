import { CodeGenerationExhaustedError } from "../domain/errors";
import { LongUrl } from "../domain/long-url";
import type { ShortenedUrl } from "../domain/shortened-url";
import type { UrlRepository } from "../domain/url-repository";
import type { ShortCodeGenerator } from "./short-code-generator";

const MAX_CREATE_ATTEMPTS = 5;

/**
 * Detects Prisma's unique-constraint violation (error code P2002) without
 * importing `@prisma/client` into the application layer. Duck-typed on the
 * `code` property that `PrismaClientKnownRequestError` carries, so any other
 * repository failure (e.g. a dropped connection) is re-thrown immediately
 * instead of being silently retried.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

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

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const code = await this.generator.generate();

      try {
        return await this.repository.create({
          code: code.value,
          longUrl: longUrl.value,
          urlHash: longUrl.hash,
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }

        // Unique-constraint race: another request created a record with the
        // same hash (return it) or the same code (retry with a new code).
        const raced = await this.repository.findByHash(longUrl.hash);
        if (raced) {
          return raced;
        }
      }
    }

    throw new CodeGenerationExhaustedError(MAX_CREATE_ATTEMPTS);
  }
}
