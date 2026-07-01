import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";

export class UniqueConstraintViolationError extends Error {
  constructor(field: "code" | "urlHash") {
    super(`Unique constraint violation on field: ${field}`);
  }
}

/**
 * Test-only fake implementing the UrlRepository port with an in-memory Map.
 * Enforces the same uniqueness constraints as the Prisma adapter (code, urlHash)
 * so use-case tests exercise the same contract without touching infrastructure.
 */
export class InMemoryUrlRepository implements UrlRepository {
  private readonly byCode = new Map<string, ShortenedUrl>();
  private readonly byHash = new Map<string, ShortenedUrl>();

  async findByHash(urlHash: string): Promise<ShortenedUrl | null> {
    return this.byHash.get(urlHash) ?? null;
  }

  async findByCode(code: string): Promise<ShortenedUrl | null> {
    return this.byCode.get(code) ?? null;
  }

  async existsByCode(code: string): Promise<boolean> {
    return this.byCode.has(code);
  }

  async create(input: CreateShortenedUrlInput): Promise<ShortenedUrl> {
    if (this.byCode.has(input.code)) {
      throw new UniqueConstraintViolationError("code");
    }

    if (this.byHash.has(input.urlHash)) {
      throw new UniqueConstraintViolationError("urlHash");
    }

    const record: ShortenedUrl = {
      code: input.code,
      longUrl: input.longUrl,
      urlHash: input.urlHash,
      createdAt: new Date(),
    };

    this.byCode.set(record.code, record);
    this.byHash.set(record.urlHash, record);

    return record;
  }
}
