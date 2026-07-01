import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";

/**
 * Mimics the shape of Prisma's `PrismaClientKnownRequestError` for a unique
 * constraint violation (code `P2002`, `meta.target` naming the offending
 * field(s)) closely enough that `isUniqueConstraintViolation` in
 * `application/shorten-url.ts` recognizes it the same way it recognizes a
 * real Prisma error.
 */
export class UniqueConstraintViolationError extends Error {
  readonly code = "P2002";
  readonly meta: { target: string[] };

  constructor(field: "code" | "urlHash") {
    super(`Unique constraint violation on field: ${field}`);
    this.meta = { target: [field] };
  }
}

/**
 * Mimics the shape of Prisma's `PrismaClientKnownRequestError` for a
 * "record not found" failure (code `P2025`), thrown by Prisma's `update`
 * when the `where` clause matches no row. `incrementClicks` on both
 * adapters MUST agree on this so the record-click use case's error-handling
 * contract is identical regardless of which repository backs it.
 */
export class RecordNotFoundError extends Error {
  readonly code = "P2025";

  constructor(code: string) {
    super(`No record found to update for code: "${code}"`);
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
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
    };

    this.byCode.set(record.code, record);
    this.byHash.set(record.urlHash, record);

    return record;
  }

  async incrementClicks(code: string): Promise<void> {
    const record = this.byCode.get(code);

    if (!record) {
      // Matches Prisma's `update` behavior: a `where` clause matching no
      // row throws P2025. Keeping this a throw (not a silent no-op) is
      // required for Prisma/InMemory parity — see url-shortening spec.
      throw new RecordNotFoundError(code);
    }

    const updated: ShortenedUrl = {
      ...record,
      clickCount: record.clickCount + 1,
      lastClickedAt: new Date(),
    };

    this.byCode.set(updated.code, updated);
    this.byHash.set(updated.urlHash, updated);
  }

  async listAll(): Promise<ShortenedUrl[]> {
    return [...this.byCode.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
}
