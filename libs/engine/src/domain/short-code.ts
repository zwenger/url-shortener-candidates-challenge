const BASE62_PATTERN = /^[A-Za-z0-9]+$/;

export class ShortCode {
  private constructor(public readonly value: string) {}

  static create(value: string): ShortCode {
    if (!BASE62_PATTERN.test(value)) {
      throw new Error(`Invalid short code: "${value}"`);
    }

    return new ShortCode(value);
  }
}
