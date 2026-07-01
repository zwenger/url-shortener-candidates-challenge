export interface ShortenedUrl {
  readonly code: string;
  readonly longUrl: string;
  readonly urlHash: string;
  readonly createdAt: Date;
}
