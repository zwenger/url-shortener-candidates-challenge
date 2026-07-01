import { InvalidShortCodeError, UrlNotFoundError } from "../domain/errors";
import { ShortCode } from "../domain/short-code";
import type { ShortenedUrl } from "../domain/shortened-url";
import type { UrlRepository } from "../domain/url-repository";

export class ResolveUrlUseCase {
  constructor(private readonly repository: UrlRepository) {}

  async execute(code: string): Promise<ShortenedUrl> {
    let shortCode: ShortCode;

    try {
      shortCode = ShortCode.create(code);
    } catch (error) {
      if (error instanceof InvalidShortCodeError) {
        throw new UrlNotFoundError(code);
      }
      throw error;
    }

    const shortenedUrl = await this.repository.findByCode(shortCode.value);

    if (!shortenedUrl) {
      throw new UrlNotFoundError(code);
    }

    return shortenedUrl;
  }
}
