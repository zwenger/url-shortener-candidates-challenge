export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidUrlError extends DomainError {
  constructor(rawUrl: string) {
    super(`Invalid URL: "${rawUrl}"`);
  }
}

export class UrlNotFoundError extends DomainError {
  constructor(code: string) {
    super(`No URL found for code: "${code}"`);
  }
}

export class CodeGenerationExhaustedError extends DomainError {
  constructor(maxAttempts: number) {
    super(`Exhausted ${maxAttempts} attempts generating a unique short code`);
  }
}
