import type { ShortenedUrl } from "../domain/shortened-url";
import type { UrlRepository } from "../domain/url-repository";

/**
 * Returns every persisted `ShortenedUrl` newest-first, with no mapping or
 * pagination — the entity already carries the exact listing shape this
 * slice needs (LOCKED #813: pagination deferred).
 */
export class ListUrlsUseCase {
  constructor(private readonly repository: UrlRepository) {}

  async execute(): Promise<ShortenedUrl[]> {
    return this.repository.listAll();
  }
}
