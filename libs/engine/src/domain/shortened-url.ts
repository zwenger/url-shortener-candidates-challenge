export interface ShortenedUrl {
  readonly code: string;
  readonly longUrl: string;
  readonly urlHash: string;
  readonly clickCount: number;
  readonly lastClickedAt: Date | null;
  readonly createdAt: Date;
}
