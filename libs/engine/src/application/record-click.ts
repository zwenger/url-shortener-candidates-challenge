import { InvalidShortCodeError } from "../domain/errors";
import { ShortCode } from "../domain/short-code";
import type { UrlRepository } from "../domain/url-repository";

/**
 * Records a click for a resolved short code. This use case is invoked
 * best-effort by the web loader after a redirect has already been computed
 * — a failure here must never propagate and break the redirect response.
 */
export class RecordClickUseCase {
  constructor(private readonly repository: UrlRepository) {}

  async execute(code: string): Promise<void> {
    let shortCode: ShortCode;

    try {
      shortCode = ShortCode.create(code);
    } catch (error) {
      if (error instanceof InvalidShortCodeError) {
        return;
      }
      throw error;
    }

    // Intentionally not caught here: the caller (the web loader) is
    // responsible for the best-effort `.catch(log)` handling, since it owns
    // the logging concern. This use case only guards against malformed
    // codes reaching the repository — it does not swallow repository
    // failures itself.
    await this.repository.incrementClicks(shortCode.value);
  }
}
