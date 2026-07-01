import type { ShortenedUrl } from "./shortened-url";

export interface CreateShortenedUrlInput {
  readonly code: string;
  readonly longUrl: string;
  readonly urlHash: string;
}

export interface UrlRepository {
  findByHash(urlHash: string): Promise<ShortenedUrl | null>;
  findByCode(code: string): Promise<ShortenedUrl | null>;
  existsByCode(code: string): Promise<boolean>;
  create(input: CreateShortenedUrlInput): Promise<ShortenedUrl>;
  incrementClicks(code: string): Promise<void>;
  listAll(): Promise<ShortenedUrl[]>;
}
