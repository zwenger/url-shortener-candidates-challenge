import { ResolveUrlUseCase } from "../application/resolve-url";
import { ShortCodeGenerator } from "../application/short-code-generator";
import { ShortenUrlUseCase } from "../application/shorten-url";
import type { UrlRepository } from "../domain/url-repository";
import { getPrismaClient } from "./prisma-client";
import { PrismaUrlRepository } from "./prisma-url-repository";

export interface Engine {
  shortenUrl: (rawUrl: string) => ReturnType<ShortenUrlUseCase["execute"]>;
  resolveUrl: (code: string) => ReturnType<ResolveUrlUseCase["execute"]>;
}

export interface EngineDeps {
  repository?: UrlRepository;
}

export function createEngine(deps: EngineDeps = {}): Engine {
  const repository =
    deps.repository ?? new PrismaUrlRepository(getPrismaClient());
  const generator = new ShortCodeGenerator(repository);
  const shortenUrlUseCase = new ShortenUrlUseCase(repository, generator);
  const resolveUrlUseCase = new ResolveUrlUseCase(repository);

  return {
    shortenUrl: (rawUrl: string) => shortenUrlUseCase.execute(rawUrl),
    resolveUrl: (code: string) => resolveUrlUseCase.execute(code),
  };
}
