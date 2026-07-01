import { randomInt } from "node:crypto";
import { CodeGenerationExhaustedError } from "../domain/errors";
import { ShortCode } from "../domain/short-code";
import type { UrlRepository } from "../domain/url-repository";

const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const DEFAULT_LENGTH = 7;
const DEFAULT_MAX_ATTEMPTS = 5;

function randomBase62(length: number): string {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)];
  }

  return result;
}

export class ShortCodeGenerator {
  private readonly length: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly repository: UrlRepository,
    length: number = Number(process.env.SHORT_CODE_LENGTH ?? DEFAULT_LENGTH),
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  ) {
    this.length = length;
    this.maxAttempts = maxAttempts;
  }

  async generate(): Promise<ShortCode> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const candidate = randomBase62(this.length);

      if (!(await this.repository.existsByCode(candidate))) {
        return ShortCode.create(candidate);
      }
    }

    throw new CodeGenerationExhaustedError(this.maxAttempts);
  }
}
