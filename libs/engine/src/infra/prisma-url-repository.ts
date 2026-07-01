import type { PrismaClient, Url as PrismaUrl } from "@prisma/client";
import type { ShortenedUrl } from "../domain/shortened-url";
import type {
  CreateShortenedUrlInput,
  UrlRepository,
} from "../domain/url-repository";

function toDomain(row: PrismaUrl): ShortenedUrl {
  return {
    code: row.code,
    longUrl: row.longUrl,
    urlHash: row.urlHash,
    clickCount: row.clickCount,
    lastClickedAt: row.lastClickedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaUrlRepository implements UrlRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByHash(urlHash: string): Promise<ShortenedUrl | null> {
    const row = await this.prisma.url.findUnique({ where: { urlHash } });
    return row ? toDomain(row) : null;
  }

  async findByCode(code: string): Promise<ShortenedUrl | null> {
    const row = await this.prisma.url.findUnique({ where: { code } });
    return row ? toDomain(row) : null;
  }

  async existsByCode(code: string): Promise<boolean> {
    const row = await this.prisma.url.findUnique({
      where: { code },
      select: { code: true },
    });
    return row !== null;
  }

  async create(input: CreateShortenedUrlInput): Promise<ShortenedUrl> {
    const row = await this.prisma.url.create({ data: input });
    return toDomain(row);
  }

  async incrementClicks(code: string): Promise<void> {
    await this.prisma.url.update({
      where: { code },
      data: {
        clickCount: { increment: 1 },
        lastClickedAt: new Date(),
      },
    });
  }

  async listAll(): Promise<ShortenedUrl[]> {
    const rows = await this.prisma.url.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }
}
