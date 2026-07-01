import { UrlNotFoundError } from "../domain/errors";
import type { ShortenedUrl } from "../domain/shortened-url";
import type { UrlRepository } from "../domain/url-repository";

export class ResolveUrlUseCase {
  constructor(private readonly repository: UrlRepository) {}

  async execute(code: string): Promise<ShortenedUrl> {
    const shortenedUrl = await this.repository.findByCode(code);

    if (!shortenedUrl) {
      throw new UrlNotFoundError(code);
    }

    return shortenedUrl;
  }
}
